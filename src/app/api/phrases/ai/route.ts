import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember } from "@/lib/api-auth";
import { runAi } from "@/lib/ai";
import { sanitizeUserText } from "@/lib/planner";
import { AI_FEATURES } from "@/lib/ai-usage";

// ИИ-фразы: перевод своей фразы, «ещё фразы» раздела, пак для любого языка.
// Лимит, BYOK и учёт — в едином оркестраторе lib/ai.ts (старый личный Map-лимитер
// удалён: он не имел чистки и не попал бы в будущий Redis-шов).

const CATEGORIES = ["basics", "food", "transport", "shopping", "emergency", "social"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_RU: Record<Category, string> = {
  basics: "основы: приветствия, спасибо, да/нет, извинения, «вы говорите по-английски»",
  food: "еда и ресторан: меню, счёт, вкусно, вода, без острого",
  transport: "транспорт: такси, метро, билет, аэропорт, сколько стоит до…",
  shopping: "покупки: цена, торг, карта/наличные, пакет",
  emergency: "экстренные: помогите, врач, аптека, полиция, потерял документы",
  social: "общение: как дела, меня зовут, можно фото, красиво!",
};

interface AiPhrase {
  ru: string;
  foreign: string;
  translit: string;
  category: Category;
}

function parsePhrases(raw: string): AiPhrase[] {
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
      ru: typeof it.ru === "string" ? it.ru.trim().slice(0, 200) : "",
      foreign: typeof it.foreign === "string" ? it.foreign.trim().slice(0, 300) : "",
      translit: typeof it.translit === "string" ? it.translit.trim().slice(0, 200) : "",
      category: CATEGORIES.includes(it.category as Category) ? (it.category as Category) : "basics",
    }))
    .filter((it) => it.ru.length > 0 && it.foreign.length > 0);
}

function parseTranslation(raw: string): { cn: string; pinyin: string } | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const it = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const foreign = typeof it.foreign === "string" ? it.foreign.trim().slice(0, 300) : "";
    const translit = typeof it.translit === "string" ? it.translit.trim().slice(0, 200) : "";
    if (!foreign) return null;
    return { cn: foreign, pinyin: translit };
  } catch {
    return null;
  }
}

// POST /api/phrases/ai — body:
// { tripId, mode: "translate", text, language? }            → { cn, pinyin } (в БД не пишем)
// { tripId, mode: "more", language, languageName?, category, count? } → { created, phrases }
// { tripId, mode: "pack", language, languageName?, count? }  → { created, phrases }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tripId, mode, language, languageName, category, text, count } = body as {
      tripId?: string;
      mode?: "translate" | "more" | "pack";
      language?: string;
      languageName?: string;
      category?: string;
      text?: string;
      count?: number;
    };

    if (!tripId || !mode) {
      return NextResponse.json({ error: "tripId и mode обязательны" }, { status: 400 });
    }
    const trimmedText = text?.trim().slice(0, 200) ?? "";
    if (mode === "translate" && !trimmedText) {
      return NextResponse.json({ error: "text обязателен для перевода" }, { status: 400 });
    }
    if (mode !== "translate" && !language?.trim()) {
      return NextResponse.json({ error: "language обязателен" }, { status: 400 });
    }

    const { user, response } = await requireTripMember(req, tripId);
    if (response) return response;

    const trip = await db.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });
    if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });

    // languageName — свободная строка с клиента: участник-контент, в промпт через санитайзер
    const langLabel = sanitizeUserText(languageName || language || "", 40);

    /* Перевод одной фразы — в БД не пишем, клиент подставит в форму */
    if (mode === "translate") {
      const system =
        "Ты — переводчик-разговорник для путешественников. Переведи русскую фразу на указанный язык так, как её сказали бы местные в быту (разговорно, вежливо, коротко). Дай транслитерацию латиницей по слогам, чтобы русскоязычный мог прочитать вслух. " +
        'Отвечай СТРОГО JSON-объектом без markdown: {"foreign": "фраза на языке", "translit": "чтение латиницей"}. Никакого текста до или после.';
      const prompt = `Язык: ${langLabel || "язык страны поездки"}. Страна поездки: ${trip.destination ? sanitizeUserText(trip.destination, 120) : "неизвестна"}. Фраза: «${sanitizeUserText(trimmedText, 200)}»`;
      const ai = await runAi({ req, userId: user.id, tripId, feature: "phrases-ai", system, prompt });
      if (!ai.ok) return phrasesAiError(ai);
      const t = parseTranslation(ai.text);
      if (!t) return NextResponse.json({ error: "ИИ ответил не по формату — попробуй ещё раз" }, { status: 502 });
      return NextResponse.json({ cn: t.cn, pinyin: t.pinyin });
    }

    /* more / pack — генерация и запись в БД */
    const cat = CATEGORIES.includes(category as Category) ? (category as Category) : null;
    const wantCount = Math.min(Math.max(count ?? 0, 0) || (mode === "pack" ? 24 : 8), mode === "pack" ? 30 : 12);

    const existing = await db.phrase.findMany({
      where: { tripId },
      select: { cn: true, ru: true, category: true, language: true },
    });
    // «多少钱?» и «多少钱？」 — одна фраза: сравниваем без пунктуации и регистра
    const normForeign = (s: string) => s.replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
    const haveForeign = new Set(existing.map((p) => normForeign(p.cn)));
    // В промпт — только фразы запрошенного языка: «Спасибо» из китайского пака
    // не должно запрещать «Спасибо» в новом языке, иначе «близкие по смыслу»
    // вычищают из любого пака половину базовых фраз
    const langCode = (language ?? "").trim().slice(0, 12);
    const langRu = (langCode ? existing.filter((p) => p.language === langCode) : existing).map((p) => p.ru);
    const destinationLine = trip.destination ? sanitizeUserText(trip.destination, 120) : "неизвестна";

    const lastOrders = await db.phrase.groupBy({ by: ["category"], where: { tripId }, _max: { order: true } });
    const orderBase = new Map<string, number>(lastOrders.map((g) => [g.category, (g._max.order ?? 0) + 1]));

    const system =
      "Ты — составитель карманного разговорника для русскоязычных путешественников. Фразы короткие, вежливые и реально нужные в быту — так, как говорят locals. Для каждой фразы дай русский перевод, фразу на языке и чтение латиницей по слогам. " +
      'Отвечай СТРОГО JSON-массивом без markdown, каждый элемент: {"ru": "по-русски", "foreign": "на языке", "translit": "чтение латиницей", "category": "basics|food|transport|shopping|emergency|social"}. Никакого текста до или после.';

    const userPrompt =
      mode === "pack"
        ? `Язык: ${langLabel}. Страна поездки: ${destinationLine}.
Составь сбалансированный набор из ${wantCount} фраз по разделам:
${CATEGORIES.map((c) => `- ${c}: ${CATEGORY_RU[c]}`).join("\n")}
(по 4–5 фраз на раздел).
Уже есть на этом языке — НЕ повторяй их и близкие по смыслу: ${langRu.slice(0, 60).join(" | ") || "пусто"}.`
        : `Язык: ${langLabel}. Страна поездки: ${destinationLine}.
Составь ${wantCount} новых фраз раздела «${cat ? CATEGORY_RU[cat] : "основы"}». Категория каждой фразы: «${cat ?? "basics"}».
Уже есть в разговорнике — НЕ повторяй их и близкие по смыслу: ${langRu.slice(0, 60).join(" | ") || "пусто"}.`;

    const ai = await runAi({ req, userId: user.id, tripId, feature: "phrases-ai", system, prompt: userPrompt });
    if (!ai.ok) return phrasesAiError(ai);
    let phrases = parsePhrases(ai.text);
    if (mode === "more" && cat) phrases = phrases.map((p) => ({ ...p, category: cat }));
    // дедуп по иностранному тексту (без учета регистра)
    phrases = phrases.filter((p) => !haveForeign.has(normForeign(p.foreign)));
    // в more ещё раз против повторов внутри ответа
    phrases = phrases.filter((p, i) => phrases.findIndex((q) => normForeign(q.foreign) === normForeign(p.foreign)) === i);
    if (phrases.length === 0) {
      return NextResponse.json({ error: "ИИ не предложил новых фраз — попробуй ещё раз" }, { status: 502 });
    }

    const data = phrases.map((p) => {
      const base = orderBase.get(p.category) ?? 1;
      orderBase.set(p.category, base + 1);
      return {
        tripId,
        category: p.category,
        ru: p.ru,
        cn: p.foreign,
        pinyin: p.translit,
        language: langCode,
        order: base,
      };
    });
    await db.phrase.createMany({ data });
    await publish(tripId, "phrase:updated", {});

    return NextResponse.json({
      created: data.length,
      phrases: data.map((d) => ({ ru: d.ru, cn: d.cn, pinyin: d.pinyin, category: d.category })),
    });
  } catch (e) {
    console.error("[phrases/ai] error:", e);
    return NextResponse.json({ error: "Не удалось сгенерировать фразы" }, { status: 500 });
  }
}

// Маппер неудач оркестратора в ответы с прежними текстами (контракт клиента):
// 429 со своим «ИИ устал» (Retry-After наследуем от общего лимитера), 403 блока, 503 «добавь свой ключ».
function phrasesAiError(ai: Awaited<ReturnType<typeof runAi>>): NextResponse {
  if (!ai.ok) {
    if (ai.reason === "rate_limited") {
      const retryAfter = ai.limitResponse?.headers.get("Retry-After") ?? undefined;
      // Лимит из реестра, не хардкод: смена лимита не должна врать в тексте
      return NextResponse.json(
        { error: `ИИ устал: не больше ${AI_FEATURES["phrases-ai"].limit.max} запросов в час` },
        { status: 429, ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}) }
      );
    }
    if (ai.reason === "blocked") {
      return NextResponse.json({ error: "ИИ недоступен для твоего аккаунта — обратись к админу" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "ИИ недоступен — добавь свой ключ ИИ в настройках профиля или попроси админа" },
      { status: 503 }
    );
  }
  return NextResponse.json({ error: "Не удалось сгенерировать фразы" }, { status: 500 });
}
