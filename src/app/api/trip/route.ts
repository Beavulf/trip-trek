import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/trip — сводка поездки: настройки + статистика
export async function GET() {
  const settings = await db.tripSettings.findUnique({ where: { id: "default" } });
  if (!settings) return NextResponse.json({ error: "No trip" }, { status: 404 });

  const [participants, days, places, photos, expenses, journals] = await Promise.all([
    db.participant.findMany({ orderBy: { createdAt: "asc" } }),
    db.day.findMany({
      orderBy: { dayNumber: "asc" },
      include: {
        places: { orderBy: { order: "asc" }, select: { id: true, name: true, category: true, status: true, timeOfDay: true, budget: true, rating: true, dayId: true } },
        _count: { select: { places: true, photos: true, expenses: true } },
      },
    }),
    db.place.findMany(),
    db.photo.count(),
    db.expense.findMany({ include: { paidBy: true } }),
    db.journalEntry.count(),
  ]);

  const visitedPlaces = places.filter((p) => p.status === "visited").length;
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  const now = new Date();
  const start = new Date(settings.startDate);
  start.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const currentDayNumber = Math.max(1, Math.min(settings.totalDays, diffDays + 1));

  const dayProgress = Math.min(100, Math.round(((diffDays + 1) / settings.totalDays) * 100));
  const placeProgress = places.length > 0 ? Math.round((visitedPlaces / places.length) * 100) : 0;

  // totalBudget = сумма бюджетов участников (если у всех есть budget), иначе из настроек
  const allHaveBudget = participants.length > 0 && participants.every((p) => p.budget != null);
  const calculatedBudget = allHaveBudget
    ? participants.reduce((sum, p) => sum + (p.budget ?? 0), 0)
    : settings.totalBudget;

  return NextResponse.json({
    settings: { ...settings, totalBudget: calculatedBudget },
    participants,
    currentDayNumber,
    dayProgress,
    placeProgress,
    visitedPlaces,
    totalPlaces: places.length,
    totalSpent,
    remainingBudget: calculatedBudget - totalSpent,
    totalPhotos: photos,
    totalJournals: journals,
    days,
  });
}
