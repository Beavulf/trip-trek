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

    // P0 #3: SDK fail → 502 error (не 200 + fake template)
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
      const content = (completion as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
      if (!content) {
        // SDK вернул пустой ответ — это ошибка, не шаблон
        return NextResponse.json({ error: "AI вернул пустой ответ" }, { status: 502 });
      }
      return NextResponse.json({ content, type, generated: true });
    } catch (sdkErr) {
      // P0 #3: не маскируем ошибку шаблоном — возвращаем 502
      const msg = sdkErr instanceof Error ? sdkErr.message : "SDK недоступен";
      console.error("[ai-summary] SDK error:", msg);
      return NextResponse.json(
        { error: `Не удалось сгенерировать: ${msg}`, type },
        { status: 502 }
      );
    }
  } catch (e) {
    console.error("AI summary error:", e);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
