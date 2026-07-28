import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/ai-summary — генерация AI-итогов
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get("tripId") || "default-trip";
    const body = await req.json().catch(() => ({}));
    const type = (body as { type?: string })?.type || "summary";

    // Собираем данные поездки из multi-trip schema
    const [trip, members, days, places, expenses, journals, photos] = await Promise.all([
      db.trip.findUnique({ where: { id: tripId } }),
      db.tripMember.findMany({ where: { tripId }, orderBy: { joinedAt: "asc" } }),
      db.day.findMany({ where: { tripId }, orderBy: { dayNumber: "asc" } }),
      db.place.findMany({ where: { tripId }, orderBy: { order: "asc" } }),
      db.expense.findMany({ where: { tripId }, orderBy: { createdAt: "desc" } }),
      db.journalEntry.findMany({
        where: { tripId },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      }),
      db.photo.findMany({ where: { tripId }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

    if (!trip) return NextResponse.json({ error: "trip not found" }, { status: 404 });

    const visitedPlaces = places.filter((p) => p.status === "visited");
    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const progress = places.length > 0 ? Math.round((visitedPlaces.length / places.length) * 100) : 0;

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "summary") {
      systemPrompt = "Ты — туристический ИИ-помощник. Создай краткий текстовый итог поездки.";
      userPrompt = `Поездка "${trip.title}" в ${trip.destination}.
Дней: ${trip.totalDays}. Мест: ${places.length} (посещено ${visitedPlaces.length}).
Участников: ${members.length}. Расходы: $${totalSpent.toFixed(2)}.
Прогресс: ${progress}%.
Дни: ${days.map((d) => `День ${d.dayNumber}: ${d.city} — ${d.title}`).join(", ")}.
Места: ${places.map((p) => `${p.name} (${p.category}${p.status === "visited" ? " ✓" : ""})`).join(", ")}`;
    } else if (type === "day") {
      systemPrompt = "Ты — туристический ИИ-помощник. Опиши день поездки.";
      const currentDayNum = Math.min(trip.totalDays, Math.max(1, Math.ceil((Date.now() - new Date(trip.startDate).getTime()) / 86400000) + 1));
      const day = days.find((d) => d.dayNumber === currentDayNum);
      const dayPlaces = places.filter((p) => p.dayId === day?.id);
      const dayExpenses = expenses.filter((e) => e.dayId === day?.id);
      const dayJournals = journals.filter((j) => j.dayId === day?.id);
      userPrompt = `День ${currentDayNum} поездки "${trip.title}" в ${trip.destination}.
Город: ${day?.city ?? "неизвестен"}.
Места: ${dayPlaces.map((p) => `${p.name} (${p.category})`).join(", ") || "пока нет"}.
Расходы за день: $${dayExpenses.reduce((s, e) => s + e.amount, 0).toFixed(2)}.
Заметки: ${dayJournals.map((j) => `${j.mood ?? ""} ${j.content}`).join(" | ")}`;
    } else {
      systemPrompt = "Ты — туристический ИИ-помощник. Дай практичные советы.";
      userPrompt = `Поездка "${trip.title}" в ${trip.destination}.
Участников: ${members.length}. Бюджет: $${trip.totalBudget}.
Расходы: $${totalSpent.toFixed(2)}.
Посещено мест: ${visitedPlaces.length} из ${places.length}.
Дай 5 практичных советов для остальных дней.`;
    }

    // Используем z-ai-web-dev-sdk
    let ZAI: { default: { chat: { completions: { create: (opts: unknown) => Promise<{ choices: { message: { content: string } }[] }> } } } };
    try {
      ZAI = require("z-ai-web-dev-sdk");
    } catch {
      // SDK недоступен — fallback
      return NextResponse.json({
        content: type === "summary"
          ? `Поездка "${trip.title}" в ${trip.destination}: ${visitedPlaces.length} из ${places.length} мест посещено, расходы $${totalSpent.toFixed(2)}, прогресс ${progress}%.`
          : type === "day"
          ? `День в ${trip.destination}: продолжаем исследовать!`
          : "Совет: не забудьте проверить документы и зарядить телефон перед выходом.",
        type,
      });
    }

    const zai = ZAI.default;
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const content = completion.choices?.[0]?.message?.content || "Не удалось сгенерировать итог.";

    return NextResponse.json({ content, type });
  } catch (e) {
    console.error("AI summary error:", e);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
