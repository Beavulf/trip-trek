import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/ai-summary — генерация AI-итогов поездки
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type } = body as { type?: "summary" | "day" | "tips" };

    // Собираем данные поездки
    const [settings, participants, days, places, expenses, journals, photos] = await Promise.all([
      db.tripSettings.findUnique({ where: { id: "default" } }),
      db.participant.findMany(),
      db.day.findMany({ orderBy: { dayNumber: "asc" }, include: { places: { orderBy: { order: "asc" } } } }),
      db.place.findMany(),
      db.expense.findMany({ include: { paidBy: true } }),
      db.journalEntry.findMany({ include: { participant: true, day: { select: { dayNumber: true, city: true } } }, orderBy: { createdAt: "asc" } }),
      db.photo.count(),
    ]);

    if (!settings) return NextResponse.json({ error: "No trip" }, { status: 404 });

    const visitedPlaces = places.filter((p) => p.status === "visited");
    const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

    // Динамический импорт SDK (backend only)
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "day") {
      // Итог текущего дня
      const currentDayNum = Math.max(1, Math.min(settings.totalDays, Math.floor((Date.now() - new Date(settings.startDate).getTime()) / 86400000) + 1));
      const currentDay = days.find((d) => d.dayNumber === currentDayNum);
      const dayVisited = currentDay?.places.filter((p) => p.status === "visited") ?? [];
      const dayJournals = journals.filter((j) => j.dayId === currentDay?.id);
      const dayExpenses = expenses.filter((e) => e.dayId === currentDay?.id);
      const daySpent = dayExpenses.reduce((s, e) => s + e.amount, 0);

      systemPrompt = "Ты — душевный дневник путешественника. Пишешь короткие, атмосферные итоги дня на русском языке. Используй эмодзи уместно. Тон — тёплый, дружеский, как будто пишешь другу. Не более 4-5 предложений.";
      userPrompt = `Составь итог дня ${currentDayNum} поездки в Китай.

День: ${currentDay?.dayNumber} — ${currentDay?.city}
Тема дня: ${currentDay?.title}
Описание: ${currentDay?.summary}

Посещено мест: ${dayVisited.length} из ${currentDay?.places.length ?? 0}
Посещённые места: ${dayVisited.map((p) => p.name).join(", ") || "пока нет"}

Записи дневника:
${dayJournals.map((j) => `- ${j.mood ?? ""} ${j.content}`).join("\n") || "нет записей"}

Потрачено за день: $${daySpent.toFixed(0)}
Расходы: ${dayExpenses.map((e) => `${e.description} ($${e.amount})`).join(", ") || "нет трат"}

Фото за день: ${photos}

Напиши красивый итог этого дня.`;
    } else if (type === "tips") {
      // AI-советы по оставшейся поездке
      systemPrompt = "Ты — опытный travel-наставник. Даёшь практичные, конкретные советы для путешественников в Китае на русском. Кратко, по делу, с эмодзи. 4-6 пунктов.";
      const remaining = days.filter((d) => d.dayNumber >= Math.floor((Date.now() - new Date(settings.startDate).getTime()) / 86400000) + 1);
      userPrompt = `Поездка в Китай: Гуанчжоу → Шэньчжэнь → Гонконг → Макао (12 дней).

Текущий прогресс: ${visitedPlaces.length}/${places.length} мест посещено, потрачено $${totalSpent.toFixed(0)} из $${settings.totalBudget}.

Осталось дней: ${remaining.length}
Грядущие города: ${[...new Set(remaining.map((d) => d.city))].join(", ")}

Дай 4-6 практичных советов на оставшуюся часть поездки: что обязательно успеть, на чём сэкономить, как отдохнуть, что попробовать из еды. Учитывай, что едут 3 друга.`;
    } else {
      // Общий итог поездки
      systemPrompt = "Ты — креативный travel-редактор. Создаёшь красивые, живые итоги поездки на русском языке. Используешь эмодзи, структуру, тёплый тон. Markdown-форматирование.";
      userPrompt = `Создай красивый итог поездки 3 друзей в Китай.

Поездка: ${settings.title}
Длительность: ${settings.totalDays} дней
Города: Гуанчжоу, Шэньчжэнь, Гонконг, Макао
Участники: ${participants.map((p) => `${p.name} (${p.role})`).join(", ")}

Статистика:
- Посещено мест: ${visitedPlaces.length} из ${places.length}
- Потрачено: $${totalSpent.toFixed(0)} из $${settings.totalBudget} (остаток $${(settings.totalBudget - totalSpent).toFixed(0)})
- Сделано фото: ${photos}
- Записей в дневнике: ${journals.length}

Посещённые места по городам:
${[...new Set(days.map((d) => d.city))].map((city) => {
  const cityPlaces = visitedPlaces.filter((p) => days.find((d) => d.id === p.dayId)?.city === city);
  return `${city}: ${cityPlaces.map((p) => p.name).join(", ") || "—"}`;
}).join("\n")}

Лучшие записи дневника:
${journals.slice(0, 5).map((j) => `- ${j.mood ?? ""} "${j.content.slice(0, 100)}${j.content.length > 100 ? "…" : ""}" — ${j.participant?.name}`).join("\n") || "нет записей"}

Траты по категориям:
${Object.entries(expenses.reduce((acc, e) => { acc[e.category] = (acc[e.category] ?? 0) + e.amount; return acc; }, {} as Record<string, number>)).map(([k, v]) => `- ${k}: $${v.toFixed(0)}`).join("\n")}

Создай живой, эмоциональный итог поездки: что запомнилось, лучшие моменты, атмосфера, советы на будущее. Markdown с заголовками.`;
    }

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    return NextResponse.json({ content, type: type ?? "summary" });
  } catch (e) {
    console.error("AI summary error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
