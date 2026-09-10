import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// GET /api/admin/stats — сводные цифры для дашборда и бейджей «Ещё»/профиля.
// Один источник: и вкладка «Обзор», и бейдж новых отзывов едят один кэш.
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const since14d = new Date(Date.now() - 13 * 86_400_000);
  since14d.setUTCHours(0, 0, 0, 0);

  const [
    users,
    usersNew7d,
    premium,
    trips,
    places,
    photos,
    expenses,
    feedbackNew,
    feedbackInProgress,
    feedbackResolved,
    registrations,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    db.user.count({ where: { plan: "premium" } }),
    db.trip.count(),
    db.place.count(),
    db.photo.count(),
    db.expense.count(),
    db.feedback.count({ where: { status: "new" } }),
    db.feedback.count({ where: { status: "in_progress" } }),
    db.feedback.count({ where: { status: "resolved" } }),
    // Для графика достаточно дат регистрации — группировку делаем в JS
    db.user.findMany({
      where: { createdAt: { gte: since14d } },
      select: { createdAt: true },
    }),
  ]);

  // Нулевая сетка на 14 дней (UTC), поверх — фактические регистрации
  const counts = new Map<string, number>();
  for (const r of registrations) {
    const key = dayKey(r.createdAt);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const registrations14d: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86_400_000));
    registrations14d.push({ date: key, count: counts.get(key) || 0 });
  }

  return NextResponse.json({
    users,
    usersNew7d,
    premium,
    trips,
    places,
    photos,
    expenses,
    feedback: { new: feedbackNew, inProgress: feedbackInProgress, resolved: feedbackResolved },
    registrations14d,
  });
}
