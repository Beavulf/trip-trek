import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { currencySymbol } from "@/lib/currencies";
import { runAi } from "@/lib/ai";

// «Советы шефа»: LLM предлагает знаковые блюда города, которых ещё нет в гиде.
// Пишет только клиент (пользователь выбирает, что добавить) — БД здесь не трогаем.
// Лимит, BYOK и учёт — в едином оркестраторе lib/ai.ts.

// Пример цены — в валюте конкретной поездки (buildSystemPrompt), а не жёсткий ¥
function buildSystemPrompt(priceExample: string): string {
  return `Ты — шеф-повар и гастрогид. Пользователь собирает список «что попробовать» в городе своей поездки.
Предложи 4 знаковых блюда или напитка именно этого города, которых НЕТ в списке уже добавленных.
Отвечай СТРОГО JSON-массивом без markdown-обёрток, каждый элемент:
{"name": "название по-русски", "nameCn": "оригинальное название местным письмом или null", "description": "1–2 предложения по-русски: что это и почему стоит попробовать", "price": "ориентир цены в валюте поездки, например \"${priceExample}\"", "emoji": "один эмодзи блюда"}
Никакого текста до или после JSON.`;
}

function parseSuggestions(raw: string): Suggestion[] {
  // LLM любят оборачивать JSON в ```-блоки — срезаем
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
    .map((it) => ({
      name: typeof it.name === "string" ? it.name.trim().slice(0, 200) : "",
      nameCn: typeof it.nameCn === "string" && it.nameCn.trim() ? it.nameCn.trim().slice(0, 100) : null,
      description: typeof it.description === "string" ? it.description.trim().slice(0, 500) : "",
      price: typeof it.price === "string" && it.price.trim() ? it.price.trim().slice(0, 50) : null,
      emoji: typeof it.emoji === "string" && it.emoji.trim() ? [...it.emoji.trim()][0] : "🍽️",
    }))
    .filter((it) => it.name.length > 0)
    .slice(0, 6);
}

interface Suggestion {
  name: string;
  nameCn: string | null;
  description: string;
  price: string | null;
  emoji: string;
}

// POST /api/foods/suggest — body: { tripId, city }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tripId, city } = body as { tripId?: string; city?: string };
    if (!tripId || !city?.trim()) {
      return NextResponse.json({ error: "tripId и city обязательны" }, { status: 400 });
    }
    const { user, response } = await requireTripMember(req, tripId);
    if (response) return response;

    const [trip, foods] = await Promise.all([
      db.trip.findUnique({ where: { id: tripId }, select: { destination: true, currency: true } }),
      db.foodItem.findMany({ where: { tripId }, select: { name: true } }),
    ]);
    if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });

    const existing = foods.map((f) => f.name.toLowerCase());
    const ai = await runAi({
      req,
      userId: user.id,
      tripId,
      feature: "foods-suggest",
      system: buildSystemPrompt(`${currencySymbol(trip.currency)}25–40`),
      prompt: `Город: ${city.trim()}. Контекст поездки: ${trip.destination || city.trim()}. Валюта: ${trip.currency}.
Уже в списке (не предлагай их и близкие синонимы): ${existing.length ? existing.join(", ") : "пусто"}.`,
    });
    if (!ai.ok) {
      if (ai.reason === "rate_limited" && ai.limitResponse) return ai.limitResponse;
      if (ai.reason === "blocked") {
        return NextResponse.json({ error: "ИИ недоступен для твоего аккаунта — обратись к админу" }, { status: 403 });
      }
      return NextResponse.json(
        { error: "Шеф сейчас недоступен — проверь настройки LLM (OPENAI_API_KEY)" },
        { status: 503 }
      );
    }
    const suggestions = parseSuggestions(ai.text);
    if (suggestions.length === 0) {
      return NextResponse.json({ error: "Шеф ответил не по формату — попробуй ещё раз" }, { status: 502 });
    }
    return NextResponse.json({ suggestions, city: city.trim() });
  } catch (e) {
    console.error("[foods/suggest] error:", e);
    return NextResponse.json({ error: "Не удалось получить советы шефа" }, { status: 500 });
  }
}
