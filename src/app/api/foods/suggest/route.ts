import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";

// «Советы шефа»: LLM предлагает знаковые блюда города, которых ещё нет в гиде.
// Пишет только клиент (пользователь выбирает, что добавить) — БД здесь не трогаем.

// LLM стоит денег: 10 запросов в час на пользователя на поездку (как в ai-summary)
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

const SYSTEM_PROMPT = `Ты — шеф-повар и гастрогид. Пользователь собирает список «что попробовать» в городе своей поездки.
Предложи 4 знаковых блюда или напитка именно этого города, которых НЕТ в списке уже добавленных.
Отвечай СТРОГО JSON-массивом без markdown-обёрток, каждый элемент:
{"name": "название по-русски", "nameCn": "оригинальное название местным письмом или null", "description": "1–2 предложения по-русски: что это и почему стоит попробовать", "price": "ориентир цены в валюте поездки, например \\"¥25–40\\"", "emoji": "один эмодзи блюда"}
Никакого текста до или после JSON.`;

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
    if (!checkRateLimit(`${user.id}:${tripId}`)) {
      return NextResponse.json(
        { error: "Шеф устал: не больше 10 советов в час" },
        { status: 429 }
      );
    }

    const [trip, foods] = await Promise.all([
      db.trip.findUnique({ where: { id: tripId }, select: { destination: true, currency: true } }),
      db.foodItem.findMany({ where: { tripId }, select: { name: true } }),
    ]);
    if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });

    const existing = foods.map((f) => f.name.toLowerCase());
    const userPrompt = `Город: ${city.trim()}. Контекст поездки: ${trip.destination || city.trim()}. Валюта: ${trip.currency}.
Уже в списке (не предлагай их и близкие синонимы): ${existing.length ? existing.join(", ") : "пусто"}.`;

    const content = await generateWithLLM(SYSTEM_PROMPT, userPrompt);
    if (!content) {
      return NextResponse.json(
        { error: "Шеф сейчас недоступен — проверь настройки LLM (OPENAI_API_KEY)" },
        { status: 503 }
      );
    }
    const suggestions = parseSuggestions(content);
    if (suggestions.length === 0) {
      return NextResponse.json({ error: "Шеф ответил не по формату — попробуй ещё раз" }, { status: 502 });
    }
    return NextResponse.json({ suggestions, city: city.trim() });
  } catch (e) {
    console.error("[foods/suggest] error:", e);
    return NextResponse.json({ error: "Не удалось получить советы шефа" }, { status: 500 });
  }
}

// Та же цепочка, что в ai-summary: OpenAI-совместимый API → ZAI SDK → null
async function generateWithLLM(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiBase = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (openaiKey) {
    try {
      const r = await fetch(`${openaiBase}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: openaiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.8,
        }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        console.error(`[foods/suggest] OpenAI ${r.status}: ${t.slice(0, 200)}`);
        return null;
      }
      const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      return data?.choices?.[0]?.message?.content ?? null;
    } catch (e) {
      console.error("[foods/suggest] OpenAI error:", e);
      return null;
    }
  }

  try {
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAI = ZAIModule.default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return (completion as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
