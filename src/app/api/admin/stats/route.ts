import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { resolveAiConfig } from "@/lib/ai-key";
import { getStorageUsage } from "@/lib/storage/stats";
import pkg from "../../../../../package.json";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// GET /api/admin/stats — сводные цифры для дашборда и бейджей.
// Один источник: и «Обзор», и бейдж новых отзывов едят один кэш.
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const since14d = new Date(Date.now() - 13 * 86_400_000);
  since14d.setUTCHours(0, 0, 0, 0);

  const dbStart = Date.now();
  const [
    users,
    usersNew7d,
    premium,
    admins,
    trips,
    tripsActive,
    tripsCompleted,
    places,
    photos,
    expenses,
    journals,
    messages,
    feedbackNew,
    feedbackInProgress,
    feedbackResolved,
    registrations,
    photoRows,
    expenseRows,
    journalRows,
    recentUsers,
    recentTrips,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    db.user.count({ where: { plan: "premium" } }),
    db.user.count({ where: { role: "admin" } }),
    db.trip.count(),
    db.trip.count({ where: { status: "active" } }),
    db.trip.count({ where: { status: "completed" } }),
    db.place.count(),
    db.photo.count(),
    db.expense.count(),
    db.journalEntry.count(),
    db.boardMessage.count(),
    db.feedback.count({ where: { status: "new" } }),
    db.feedback.count({ where: { status: "in_progress" } }),
    db.feedback.count({ where: { status: "resolved" } }),
    // Для графиков достаточно дат — группировку делаем в JS
    db.user.findMany({ where: { createdAt: { gte: since14d } }, select: { createdAt: true } }),
    db.photo.findMany({ where: { createdAt: { gte: since14d } }, select: { createdAt: true } }),
    db.expense.findMany({ where: { createdAt: { gte: since14d } }, select: { createdAt: true } }),
    db.journalEntry.findMany({ where: { createdAt: { gte: since14d } }, select: { createdAt: true } }),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, emoji: true, color: true, avatarUrl: true, createdAt: true },
    }),
    db.trip.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        coverEmoji: true,
        coverColor: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
    }),
  ]);
  const dbLatencyMs = Date.now() - dbStart;

  // Нулевая сетка на 14 дней (UTC), поверх — фактические значения
  const regCounts = new Map<string, number>();
  for (const r of registrations) regCounts.set(dayKey(r.createdAt), (regCounts.get(dayKey(r.createdAt)) || 0) + 1);
  const photoCounts = new Map<string, number>();
  for (const r of photoRows) photoCounts.set(dayKey(r.createdAt), (photoCounts.get(dayKey(r.createdAt)) || 0) + 1);
  const expenseCounts = new Map<string, number>();
  for (const r of expenseRows) expenseCounts.set(dayKey(r.createdAt), (expenseCounts.get(dayKey(r.createdAt)) || 0) + 1);
  const journalCounts = new Map<string, number>();
  for (const r of journalRows) journalCounts.set(dayKey(r.createdAt), (journalCounts.get(dayKey(r.createdAt)) || 0) + 1);

  const registrations14d: { date: string; count: number }[] = [];
  const activity14d: { date: string; photos: number; expenses: number; journals: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86_400_000));
    registrations14d.push({ date: key, count: regCounts.get(key) || 0 });
    activity14d.push({
      date: key,
      photos: photoCounts.get(key) || 0,
      expenses: expenseCounts.get(key) || 0,
      journals: journalCounts.get(key) || 0,
    });
  }

  // Здоровье системы: БД, ИИ-конфиг (без ключа!), push, рантайм
  const [storage, ai] = await Promise.all([
    getStorageUsage(),
    resolveAiConfig(null).then((c) => ({ source: c.source, baseUrl: c.baseUrl, model: c.model })),
  ]);

  return NextResponse.json({
    users,
    usersNew7d,
    premium,
    admins,
    trips,
    tripsActive,
    tripsCompleted,
    places,
    photos,
    expenses,
    journals,
    messages,
    feedback: { new: feedbackNew, inProgress: feedbackInProgress, resolved: feedbackResolved },
    registrations14d,
    activity14d,
    storage: { total: storage.total, files: storage.files, byKind: storage.byKind },
    health: {
      dbLatencyMs,
      ai,
      vapid: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      nodeEnv: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      uptimeSec: Math.round(process.uptime()),
      version: (pkg as { version?: string }).version || "—",
    },
    recent: { users: recentUsers, trips: recentTrips },
  });
}
