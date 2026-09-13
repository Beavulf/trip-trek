import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { calculateCurrentDayNumber } from "@/lib/trip-days";
import { EXPENSE_CATEGORIES, CATEGORY_META } from "@/lib/types";
import { currencySymbol } from "@/lib/currencies";
import { userRateLimit } from "@/lib/rate-limit";
import { resolveAiConfig, openaiChatUrl } from "@/lib/ai-key";

// ─── Промпты: автор историй + 6 стилей рассказа ────────────────────────────

const STORY_BASE = `Ты — штатный автор тревел-историй приложения TripTrek. Из сухих фактов поездки (маршрут, места, дневник, траты) ты делаешь живой текст, который участники захотят переслать друзьям.

Правила:
- Пиши по-русски, в markdown: один короткий заголовок, абзацы по 2–4 предложения, список — не длиннее 8 пунктов.
- Факты бери только из данных ниже: реальные названия мест, настроения и цитаты из дневника, цифры трат. Ничего не выдумывай и не добавляй мест, которых нет в данных.
- Конкретика вместо общих слов: не «посетили много красивых мест», а «ночной рынок, смотровая на закате и стеклянный мост».
- Запрещены штампы: «незабываемое путешествие», «впечатления переполняют», «атмосфера была невероятная», «культурная программа».
- Чередуй ритм: короткая ударная фраза — затем развёрнутая.
- Ты пишешь для своих: обращайся к компании на «вы» или пиши от её лица («мы») — выбери одно и держись до конца.
- Объём: 150–250 слов, без воды.`;

const STYLE_PROMPTS: Record<string, string> = {
  warm: `Стиль «Тёплый рассказ»: личный, светлый тон, как разговор вечером за чаем. Найди в данных одну маленькую живую деталь (запись из дневника, подпись к фото) и сделай её эмоциональным центром текста. Заверши коротким тостом поездке.`,
  letter: `Стиль «Письмо другу»: это письмо тому, кто не поехал. Начни с обращения («Привет!», «Здравствуйте!»), расскажи главное доверительно, с лёгкой ностальгией. В конце пообещай рассказать остальное при встрече и подпишись именами участников.`,
  cinema: `Стиль «Трейлер фильма»: заголовок звучит как название фильма. Драматургия: завязка → кульминация (самый яркий день или место) → финал. Короткие рубленые фразы. После заголовка — строка «В главных ролях: …» с именами участников. В самом конце — слоган поездки одной строкой.`,
  humor: `Стиль «Добрый юмор»: подметь забавное — рекордные траты, контраст планов и реальности, смешное из дневника. Смеёмся вместе, а не над кем-то: без сарказма и обидных шуток про участников. Последний абзац — тёплый и искренний.`,
  chronicle: `Стиль «Хроника»: телеграфный, фактологический, почти без лирики. Рубрики-подзаголовки: «Маршрут», «Бюджет», «Рекорды поездки». Максимум цифр и названий. В конце — рубрика «Цифра, которую запомним».`,
  tale: `Стиль «Сказка»: преврати поездку в волшебную историю («В одном городе, дальше которого нет дальше…»). Места — сказочные локации, участники — герои, бюджет — испытания. Узнаваемые реальные детали (названия, имена) обязательны. Финал — счастливый.`,
};

const DEFAULT_STYLE = "warm";

// Неклампнутый номер дня (calculateCurrentDayNumber зажат в [1..totalDays],
// а для «будущий день vs прожитый» нужна настоящая фаза поездки)
function dayOffsetFor(startDate: Date): number {
  const now = new Date();
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const s = new Date(startDate);
  const startUTC = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  return Math.round((nowUTC - startUTC) / 86400000) + 1;
}

// POST /api/ai-summary — генерация AI-итогов
// P0 #1: auth + membership; P0 #2: tripId required (no default-trip);
// P0 #3: SDK fail → 502 error (not 200 + fake template);
// P0 #4: rate-limit; P1 #6: shared day formula; P1 #8: currency;
// P2 #19: totalSpent excludes settlement.
// body: { type: "summary" | "day" | "tips", style?: string, dayNumber?: number }
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // P0 #2: без tripId → 400 (раньше || "default-trip" → China seed)
    const tripId = searchParams.get("tripId");
    if (!tripId) {
      return NextResponse.json({ error: "tripId required" }, { status: 400 });
    }

    // P0 #1: auth + membership
    const { user, response } = await requireTripMember(req, tripId);
    if (response) return response;

    // 10 генераций в час на пользователя (LLM стоит денег)
    const limited = userRateLimit(req, `${user!.id}:${tripId}`, "ai-summary", 10, 60 * 60_000);
    if (limited) return limited;

    const body = (await req.json().catch(() => ({}))) as {
      type?: string;
      style?: string;
      dayNumber?: number;
    };
    const type = body.type || "summary";
    const style = STYLE_PROMPTS[body.style || ""] ? (body.style as string) : DEFAULT_STYLE;
    const requestedDayNum =
      typeof body.dayNumber === "number" && Number.isFinite(body.dayNumber)
        ? Math.max(1, Math.floor(body.dayNumber))
        : null;

    // Собираем данные поездки
    const [trip, members, days, places, expenses, journals, photos] = await Promise.all([
      db.trip.findUnique({ where: { id: tripId } }),
      db.tripMember.findMany({
        where: { tripId },
        orderBy: { joinedAt: "asc" },
        include: { user: { select: { name: true, emoji: true } } },
      }),
      db.day.findMany({ where: { tripId }, orderBy: { dayNumber: "asc" } }),
      db.place.findMany({ where: { tripId }, orderBy: { order: "asc" } }),
      db.expense.findMany({ where: { tripId }, orderBy: { createdAt: "desc" } }),
      db.journalEntry.findMany({
        where: { tripId },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
        take: 20,
      }),
      db.photo.findMany({
        where: { tripId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { caption: true, address: true, lat: true, lng: true },
      }),
    ]);

    if (!trip) return NextResponse.json({ error: "trip not found" }, { status: 404 });

    const visitedPlaces = places.filter((p) => p.status === "visited");
    // P2 #19: totalSpent excludes settlement (как в Budget isRealExpense)
    const realExpenses = expenses.filter((e) => e.category !== "settlement");
    const totalSpent = realExpenses.reduce((sum, e) => sum + e.amount, 0);
    const progress = places.length > 0 ? Math.round((visitedPlaces.length / places.length) * 100) : 0;

    // P1 #8: валюта поездки
    const sym = currencySymbol(trip.currency);
    const memberNames = members.map((m) => m.user?.name || m.displayName).filter(Boolean);

    // P1 #7: photos/captions + member names + journals включаем в промпт.
    // Markdown-ссылки из member-контента нейтрализуем: иначе planted-текст
    // доезжал и до промпта, и до no-LLM черновика, где рендерился кликабельной
    // ссылкой/картинкой для другого участника (аудит 2026-09-12)
    const sanitizeForAi = (t: string) => t.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
    const photoCaptions = photos
      .map((p) => sanitizeForAi(p.caption || p.address || ""))
      .filter(Boolean)
      .slice(0, 10);
    const journalTexts = journals
      .slice(0, 10)
      .map((j) => sanitizeForAi(`${j.mood ?? ""} ${j.user?.name ?? ""}: ${j.content}`.trim()))
      .filter(Boolean);

    // Траты по категориям (топ-3) — дают отчёту конкретику
    const catTotals = new Map<string, number>();
    for (const e of realExpenses) {
      catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + e.amount);
    }
    const topCategories = [...catTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, sum]) => {
        const meta = EXPENSE_CATEGORIES[cat];
        return `${meta?.emoji ?? "💸"} ${meta?.label ?? cat}: ${sym}${sum.toFixed(0)}`;
      })
      .join(", ");

    const todayIso = new Date().toISOString().slice(0, 10);
    const realCurrentDay = calculateCurrentDayNumber(trip.startDate, trip.totalDays);
    const dayOffset = dayOffsetFor(trip.startDate);
    const phaseNote =
      dayOffset <= 0
        ? "поездка ещё не началась"
        : dayOffset > trip.totalDays
          ? "поездка завершена"
          : `сейчас день ${dayOffset}`;
    const datesLine = `${new Date(trip.startDate).toISOString().slice(0, 10)} → ${
      trip.endDate ? new Date(trip.endDate).toISOString().slice(0, 10) : "…"
    }`;

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "summary") {
      systemPrompt =
        STORY_BASE +
        "\n\n" +
        STYLE_PROMPTS[style] +
        "\n\nЗадача: финальный отчёт по всей поездке. Дай дугу: с чего начали → самый яркий момент → чем закончились. 3–4 абзаца, один список допустим.";
      userPrompt = `Факты поездки.
Поездка «${trip.title}», направление: ${trip.destination}.
Даты: ${datesLine}. Сегодня: ${todayIso}. Дней: ${trip.totalDays} (${phaseNote}).
Участники (${members.length}): ${memberNames.join(", ") || "нет данных"}.
Маршрут: ${days.map((d) => `Д${d.dayNumber} ${d.city}${d.title ? ` — ${d.title}` : ""}`).join("; ") || "нет дней"}.
Мест: ${places.length}, посещено ${visitedPlaces.length} (${progress}%). Посещённые: ${visitedPlaces.map((p) => `${p.name} (${CATEGORY_META[p.category]?.label ?? p.category})`).slice(0, 15).join(", ") || "пока нет"}.
Траты: ${sym}${totalSpent.toFixed(2)} из бюджета ${sym}${trip.totalBudget}.${topCategories ? ` По категориям: ${topCategories}.` : ""}
Дневник: ${journalTexts.join(" | ").slice(0, 800) || "нет записей"}.
Подписи к фото: ${photoCaptions.slice(0, 8).join(", ") || "без подписей"}.`;
    } else if (type === "day") {
      // День можно выбрать любой: прошлый → рассказ, будущий → предвкушение
      const maxDay = Math.max(trip.totalDays, days.length, 1);
      const dayNum = Math.min(requestedDayNum ?? Math.min(Math.max(realCurrentDay, 1), maxDay), maxDay);
      const isFuture = dayNum > dayOffset;
      const day = days.find((d) => d.dayNumber === dayNum);
      const dayPlaces = places.filter((p) => p.dayId === day?.id);
      const dayExpenses = realExpenses.filter((e) => e.dayId === day?.id);
      const dayJournals = journals.filter((j) => j.dayId === day?.id);
      systemPrompt =
        STORY_BASE +
        "\n\n" +
        STYLE_PROMPTS[style] +
        "\n\nЗадача: рассказ об одном дне поездки. " +
        (isFuture
          ? "Этот день ещё впереди: напиши предвкушение — чего ждать от дня по плану, чем он интересен. Тон лёгкого ожидания; планы — это планы, не выдавай их за свершившееся."
          : "Прожитый день: утро → день → вечер, или «три момента дня». Можно настоящее время. 2–3 абзаца.");
      userPrompt = `Факты дня.
День ${dayNum} из ${trip.totalDays} поездки «${trip.title}» (${trip.destination}).${isFuture ? " День ещё НЕ наступил." : ""}
Город: ${day?.city ?? "неизвестен"}. Тема дня: ${day?.title || "без темы"}.
Места дня: ${dayPlaces.map((p) => `${p.name} (${CATEGORY_META[p.category]?.label ?? p.category}${p.status === "visited" ? ", посещено" : p.status === "current" ? ", сейчас здесь" : "в плане"})`).join(", ") || "пока нет"}.
Траты за день: ${sym}${dayExpenses.reduce((s, e) => s + e.amount, 0).toFixed(2)}.
Записи дневника за день: ${dayJournals.map((j) => `${j.mood ?? ""} ${j.user?.name ?? ""}: ${j.content}`).join(" | ").slice(0, 500) || "нет записей"}.`;
    } else {
      const unvisited = places.filter((p) => p.status === "planned").slice(0, 10);
      systemPrompt =
        STORY_BASE +
        "\n\n" +
        STYLE_PROMPTS[style] +
        "\n\nЗадача: 5 практичных советов на оставшуюся часть поездки. Привязывай советы к реальным данным: каким городам ещё впереди, сколько осталось бюджета, какие места не посещены. Каждый совет — конкретное действие, а не банальность. Нумерованный список.";
      userPrompt = `Факты поездки.
Поездка «${trip.title}», направление: ${trip.destination}. Сегодня: ${todayIso}, фаза: ${phaseNote} (день ${dayOffset} из ${trip.totalDays}).
Участники: ${memberNames.join(", ") || "нет данных"}.
Бюджет: ${sym}${trip.totalBudget}, потрачено ${sym}${totalSpent.toFixed(2)} (осталось ≈ ${sym}${Math.max(trip.totalBudget - totalSpent, 0).toFixed(0)}).
Посещено мест: ${visitedPlaces.length} из ${places.length}.
Впереди дни: ${days.filter((d) => d.dayNumber >= realCurrentDay).map((d) => `Д${d.dayNumber} ${d.city}`).join(", ") || "поездка заканчивается"}.
Не посещённые места: ${unvisited.map((p) => p.name).join(", ") || "основное посещено"}.${topCategories ? ` Траты по категориям: ${topCategories}.` : ""}`;
    }

    // LLM: OpenAI-compatible (Docker) → ZAI SDK → local draft from trip data
    try {
      // BYOK: ключ — юзер → админ → env; база/модель — админ → env (resolveAiConfig)
      const cfg = await resolveAiConfig(user!.id);
      const llm = await generateWithLLM(systemPrompt, userPrompt, cfg);
      if (llm) {
        return NextResponse.json({ content: llm, type, style, generated: true, source: llmSource });
      }
    } catch (sdkErr) {
      const msg = sdkErr instanceof Error ? sdkErr.message : "SDK недоступен";
      console.error("[ai-summary] LLM error:", msg);
      // Fall through to local draft so Docker still works without keys
    }

    const local = buildLocalSummary({
      type,
      title: trip.title,
      destination: trip.destination,
      totalDays: trip.totalDays,
      memberNames,
      placesCount: places.length,
      visitedCount: visitedPlaces.length,
      totalSpent,
      budget: trip.totalBudget,
      sym,
      progress,
      currentDayNum: requestedDayNum ?? realCurrentDay,
      days: days.map((d) => ({ dayNumber: d.dayNumber, city: d.city, title: d.title })),
      visitedNames: visitedPlaces.map((p) => p.name).slice(0, 12),
      journalTexts,
      photoCaptions,
    });
    return NextResponse.json({
      content: local,
      type,
      style,
      generated: false,
      source: "local",
    });
  } catch (e) {
    console.error("AI summary error:", e);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}

let llmSource: "openai" | "zai" | "local" = "local";

async function generateWithLLM(
  systemPrompt: string,
  userPrompt: string,
  cfg: { key: string | null; baseUrl: string | null; model: string | null }
): Promise<string | null> {
  const openaiKey = cfg.key;
  const openaiBase = openaiChatUrl(cfg.baseUrl);
  const openaiModel = cfg.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  if (openaiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000); // LLM может думать долго — но не дольше минуты
    try {
    const r = await fetch(`${openaiBase}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
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
        temperature: 0.9,
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`OpenAI ${r.status}: ${t.slice(0, 200)}`);
    }
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI вернул пустой ответ");
    llmSource = "openai";
    return content;
    } finally {
      clearTimeout(timeout);
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
    const content = (completion as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
      ?.message?.content;
    if (!content) return null;
    llmSource = "zai";
    return content;
  } catch {
    return null;
  }
}

function buildLocalSummary(input: {
  type: string;
  title: string;
  destination: string;
  totalDays: number;
  memberNames: string[];
  placesCount: number;
  visitedCount: number;
  totalSpent: number;
  budget: number;
  sym: string;
  progress: number;
  currentDayNum: number;
  days: { dayNumber: number; city: string; title: string }[];
  visitedNames: string[];
  journalTexts: string[];
  photoCaptions: string[];
}): string {
  const who = input.memberNames.length ? input.memberNames.join(", ") : "участники";
  if (input.type === "day") {
    const day =
      input.days.find((d) => d.dayNumber === input.currentDayNum) || input.days[0];
    return [
      `### Итог дня (черновик)`,
      ``,
      `**${input.title}** · ${day ? `День ${day.dayNumber}, ${day.city}` : input.destination}`,
      day?.title ? `План дня: *${day.title}*` : "",
      ``,
      `- Мест в поездке: **${input.placesCount}**, посещено **${input.visitedCount}** (${input.progress}%)`,
      `- Расходы всего: **${input.sym}${input.totalSpent.toFixed(0)}** из ${input.sym}${input.budget}`,
      input.visitedNames.length ? `- Уже были: ${input.visitedNames.join(", ")}` : `- Пока нет отмеченных посещений — отметь места в маршруте`,
      input.journalTexts.length ? `- Из дневника: ${input.journalTexts[0]}` : "",
      ``,
      `_Сгенерировано без нейросети (нет OPENAI_API_KEY в Docker). Добавь ключ для живого AI._`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (input.type === "tips") {
    return [
      `### Советы на поездку`,
      ``,
      `1. Сверьте маршрут на ближайшие 1–2 дня и отметьте посещённые места.`,
      `2. Следите за бюджетом: сейчас ${input.sym}${input.totalSpent.toFixed(0)} из ${input.sym}${input.budget}.`,
      `3. Добавляйте фото с геометкой — они появятся на карте и в ленте.`,
      `4. Короткая запись в дневнике вечером сохранит атмосферу дня.`,
      `5. Сверьте долги в бюджете между: ${who}.`,
      ``,
      `_Черновик без нейросети. Для AI-советов задай OPENAI_API_KEY._`,
    ].join("\n");
  }
  return [
    `### Итог поездки «${input.title}»`,
    ``,
    `Направление: **${input.destination}**. Дней: **${input.totalDays}**. Компания: ${who}.`,
    ``,
    `- Мест: **${input.placesCount}**, посещено **${input.visitedCount}** (${input.progress}%)`,
    `- Бюджет: **${input.sym}${input.totalSpent.toFixed(0)}** / ${input.sym}${input.budget}`,
    input.days.length
      ? `- Дни: ${input.days.map((d) => `Д${d.dayNumber} ${d.city}`).join(" · ")}`
      : "",
    input.visitedNames.length ? `- Запомнившиеся места: ${input.visitedNames.join(", ")}` : "",
    input.photoCaptions.length ? `- Подписи к фото: ${input.photoCaptions.slice(0, 5).join("; ")}` : "",
    input.journalTexts.length ? `- Дневник: ${input.journalTexts.slice(0, 2).join(" | ")}` : "",
    ``,
    `_Это структурированный черновик по данным поездки. Для настоящей генерации добавь \`OPENAI_API_KEY\` в docker-deploy/.env и перезапусти контейнер._`,
  ]
    .filter(Boolean)
    .join("\n");
}
