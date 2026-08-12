import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { calculateCurrentDayNumber } from "@/lib/trip-days";

// P0 #4: in-memory rate-limit per user+trip (LLM стоит денег).
// 10 запросов в час на пользователя на поездку — достаточно для тестов/демо.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 час
const RATE_LIMIT_MAX = 10;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): { ok: boolean; resetIn?: number } {
  const now = Date.now();
  const entry = rateLimit.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { ok: false, resetIn: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true };
}

// P1 #8: валюта → символ
function currencySymbol(code: string): string {
  const map: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", CNY: "¥", JPY: "¥", KRW: "₩",
    RUB: "₽", KZT: "₸", THB: "฿", UAH: "₴", HKD: "HK$", SGD: "S$",
    AUD: "A$", CAD: "C$", CHF: "Fr", INR: "₹", VND: "₫", IDR: "Rp",
    MYR: "RM", PHP: "₱", TRY: "₺", AED: "د.إ", MOP: "MOP", BYN: "Br",
  };
  return map[code] || "$";
}

// POST /api/ai-summary — генерация AI-итогов
// P0 #1: auth + membership; P0 #2: tripId required (no default-trip);
// P0 #3: SDK fail → 502 error (not 200 + fake template);
// P0 #4: rate-limit; P1 #6: shared day formula; P1 #8: currency;
// P2 #19: totalSpent excludes settlement.
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

    // P0 #4: rate-limit per user+trip
    const rlKey = `${user!.id}:${tripId}`;
    const rl = checkRateLimit(rlKey);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Лимит генераций исчерпан (${RATE_LIMIT_MAX}/час). Попробуйте через ${Math.ceil((rl.resetIn ?? 0) / 60)} мин.` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const type = (body as { type?: string })?.type || "summary";

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

    // P1 #7: photos/captions + member names + journals включаем в промпт
    const photoCaptions = photos
      .map((p) => p.caption || p.address || "")
      .filter(Boolean)
      .slice(0, 10);
    const journalTexts = journals
      .slice(0, 10)
      .map((j) => `${j.mood ?? ""} ${j.content}`.trim())
      .filter(Boolean);

    // P2 #18: system prompt — русский + markdown + лимит списков
    const systemBase = "Ты — туристический ИИ-помощник. Пиши на русском языке. Используй markdown (заголовки, списки, **жирный**). Будь лаконичен — не больше 8 пунктов в списке. Не выдумывай факты, которых нет в данных.";

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "summary") {
      systemPrompt = systemBase + " Создай красивый итоговый отчёт всей поездки: атмосфера, что посетили, что запомнилось. 3-4 абзаца + список.";
      userPrompt = `Поездка "${trip.title}" в ${trip.destination}.
Дней: ${trip.totalDays}. Мест: ${places.length} (посещено ${visitedPlaces.length}).
Участников: ${members.length} (${memberNames.join(", ")}).
Расходы: ${sym}${totalSpent.toFixed(2)} (бюджет ${sym}${trip.totalBudget}).
Прогресс: ${progress}%.
Дни: ${days.map((d) => `День ${d.dayNumber}: ${d.city} — ${d.title}`).join("; ") || "нет дней"}.
Посещённые места: ${visitedPlaces.map((p) => `${p.name} (${p.category})`).join(", ").slice(0, 500) || "пока нет"}.
Заметки из дневника: ${journalTexts.join(" | ").slice(0, 800) || "нет записей"}.
Фото: ${photoCaptions.length > 0 ? photoCaptions.join(", ") : "без подписей"}.`;
    } else if (type === "day") {
      systemPrompt = systemBase + " Опиши один день поездки: что делали, куда сходили, атмосфера. 2-3 абзаца.";
      // P1 #6: shared currentDayNumber formula (как в api/trip)
      const currentDayNum = calculateCurrentDayNumber(trip.startDate, trip.totalDays);
      const day = days.find((d) => d.dayNumber === currentDayNum);
      const dayPlaces = places.filter((p) => p.dayId === day?.id);
      const dayExpenses = realExpenses.filter((e) => e.dayId === day?.id);
      const dayJournals = journals.filter((j) => j.dayId === day?.id);
      userPrompt = `День ${currentDayNum} поездки "${trip.title}" в ${trip.destination}.
Город: ${day?.city ?? "неизвестен"}. Заголовок дня: ${day?.title ?? ""}.
Места дня: ${dayPlaces.map((p) => `${p.name} (${p.category}${p.status === "visited" ? " ✓" : ""})`).join(", ") || "пока нет"}.
Расходы за день: ${sym}${dayExpenses.reduce((s, e) => s + e.amount, 0).toFixed(2)}.
Заметки: ${dayJournals.map((j) => `${j.mood ?? ""} ${j.content}`).join(" | ") || "нет записей"}.`;
    } else {
      systemPrompt = systemBase + " Дай 5 практичных советов на оставшиеся дни поездки. Нумерованный список.";
      userPrompt = `Поездка "${trip.title}" в ${trip.destination}.
Участников: ${members.length} (${memberNames.join(", ")}).
Бюджет: ${sym}${trip.totalBudget}. Расходы: ${sym}${totalSpent.toFixed(2)}.
Посещено мест: ${visitedPlaces.length} из ${places.length}.
Дни: ${days.map((d) => `День ${d.dayNumber}: ${d.city}`).join(", ") || "нет дней"}.
Дай 5 практичных советов.`;
    }

    // LLM: OpenAI-compatible (Docker) → ZAI SDK → local draft from trip data
    try {
      const llm = await generateWithLLM(systemPrompt, userPrompt);
      if (llm) {
        return NextResponse.json({ content: llm, type, generated: true, source: llmSource });
      }
    } catch (sdkErr) {
      const msg = sdkErr instanceof Error ? sdkErr.message : "SDK недоступен";
      console.error("[ai-summary] LLM error:", msg);
      // Fall through to local draft so Docker still works without keys
    }

    const currentDayNum = calculateCurrentDayNumber(trip.startDate, trip.totalDays);
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
      currentDayNum,
      days: days.map((d) => ({ dayNumber: d.dayNumber, city: d.city, title: d.title })),
      visitedNames: visitedPlaces.map((p) => p.name).slice(0, 12),
      journalTexts,
      photoCaptions,
    });
    return NextResponse.json({
      content: local,
      type,
      generated: false,
      source: "local",
    });
  } catch (e) {
    console.error("AI summary error:", e);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}

let llmSource: "openai" | "zai" | "local" = "local";

async function generateWithLLM(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiBase = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (openaiKey) {
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
        temperature: 0.7,
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
