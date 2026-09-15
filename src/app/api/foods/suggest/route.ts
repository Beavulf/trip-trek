import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { currencySymbol } from "@/lib/currencies";
import { runAi, aiFailResponse } from "@/lib/ai";
import { sanitizeUserText, extractJsonLoose } from "@/lib/planner";
import { findCity } from "@/lib/geocode-place";

// «Советы шефа»: LLM предлагает знаковые блюда города, которых ещё нет в гиде.
// Пишет только клиент (пользователь выбирает, что добавить) — БД здесь не трогаем.
// Лимит, BYOK и учёт — в едином оркестраторе lib/ai.ts.

// Пример цены — в валюте конкретной поездки (buildSystemPrompt), а не жёсткий ¥
function buildSystemPrompt(priceExample: string, count: number): string {
  return `Ты — шеф-повар и гастрогид. Пользователь собирает список «что попробовать» в городе своей поездки.
Предложи ${count} знаковых блюд или напитков именно этого города, которых НЕТ в списке уже добавленных${count > 4 ? ". Сгруппируй так, чтобы была выборка: от уличной еды до ресторанных специалитетов" : ""}.
Отвечай СТРОГО JSON-массивом без markdown-обёрток, каждый элемент:
{"name": "название по-русски", "nameCn": "оригинальное название местным письмом или null", "description": "1–2 предложения по-русски: что это и почему стоит попробовать", "price": "ориентир цены в валюте поездки, например \"${priceExample}\"", "emoji": "один эмодзи блюда"}
Никакого текста до или после JSON.`;
}

/** Парсинг уже извлечённого JSON: поля по контракту + дедуп по имени
 * (LLM любит дублировать блюдо — без дедупа коллизии ключей и двойные добавления). */
function parseSuggestions(parsed: unknown, cap: number): Suggestion[] {
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const it of parsed) {
    if (typeof it !== "object" || it === null) continue;
    const rec = it as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 200) : "";
    if (!name) continue;
    const key = name.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      nameCn: typeof rec.nameCn === "string" && rec.nameCn.trim() ? rec.nameCn.trim().slice(0, 100) : null,
      description: typeof rec.description === "string" ? rec.description.trim().slice(0, 500) : "",
      price: typeof rec.price === "string" && rec.price.trim() ? rec.price.trim().slice(0, 50) : null,
      emoji: typeof rec.emoji === "string" && rec.emoji.trim() ? [...rec.emoji.trim()][0] : "🍽️",
    });
    if (out.length >= cap) break;
  }
  return out;
}

interface Suggestion {
  name: string;
  nameCn: string | null;
  description: string;
  price: string | null;
  emoji: string;
}

// POST /api/foods/suggest — body: { tripId, city, count? } — count 4–10 (пакет блюд)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tripId, city, count } = body as { tripId?: string; city?: string; count?: number };
    if (!tripId || !city?.trim()) {
      return NextResponse.json({ error: "tripId и city обязательны" }, { status: 400 });
    }
    // Пакетный режим: сколько блюд просим (дефолт 4 — прежний контракт)
    const want = Math.min(Math.max(Math.round(count ?? 4) || 4, 4), 10);
    const { user, response } = await requireTripMember(req, tripId);
    if (response) return response;

    const [trip, foods] = await Promise.all([
      db.trip.findUnique({ where: { id: tripId }, select: { destination: true, currency: true } }),
      db.foodItem.findMany({ where: { tripId }, select: { name: true } }),
    ]);
    if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });

    // Город с карты: свободный ввод проверяем Nominatim'ом — без этого билиберда
    // доезжает до LLM и возвращается «знаковыми блюдами» выдуманного города
    const cityCheck = await findCity(city);
    if (!cityCheck.ok) {
      return NextResponse.json(
        { error: `Не нашли город «${city.trim().slice(0, 60)}» на карте — проверьте название или выберите из списка` },
        { status: 400 }
      );
    }

    const existing = foods.map((f) => f.name.toLowerCase());
    const ai = await runAi({
      req,
      userId: user.id,
      tripId,
      feature: "foods-suggest",
      system: buildSystemPrompt(`${currencySymbol(trip.currency)}25–40`, want),
      prompt: `Город: ${sanitizeUserText(city.trim(), 80)}. Контекст поездки: ${sanitizeUserText(trip.destination || city.trim(), 120)}. Валюта: ${trip.currency}.
Уже в списке (не предлагай их и близкие синонимы): ${existing.length ? sanitizeUserText(existing.join(", "), 600) : "пусто"}.`,
    });
    if (!ai.ok) {
      return aiFailResponse(ai, {
        blocked: "ИИ недоступен для твоего аккаунта — обратись к админу",
        unavailable: "ИИ недоступен — добавь свой ключ ИИ в настройках профиля или попроси админа",
        format: "Шеф ответил не по формату — попробуй ещё раз",
      });
    }
    const suggestions = parseSuggestions(extractJsonLoose(ai.text), want);
    if (suggestions.length === 0) {
      return NextResponse.json({ error: "Шеф ответил не по формату — попробуй ещё раз" }, { status: 502 });
    }
    return NextResponse.json({ suggestions, city: city.trim() });
  } catch (e) {
    console.error("[foods/suggest] error:", e);
    return NextResponse.json({ error: "Не удалось получить советы шефа" }, { status: 500 });
  }
}
