import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Freemium лимиты
const FREE_LIMITS = {
  maxTrips: 1,        // Free: 1 поездка
  maxMembers: 5,      // Free: 5 участников
};

const PREMIUM_LIMITS = {
  maxTrips: Infinity,
  maxMembers: Infinity,
};

// GET /api/limits?userId=... — проверить лимиты пользователя
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const isPremium = user.plan === "premium" && (!user.planExpiry || user.planExpiry > new Date());
  const limits = isPremium ? PREMIUM_LIMITS : FREE_LIMITS;

  // Считаем поездки
  const tripCount = await db.tripMember.count({ where: { userId, role: "owner" } });

  // Для каждой поездки — кол-во участников
  const trips = await db.tripMember.findMany({
    where: { userId, role: "owner" },
    include: { trip: { select: { members: true } } },
  });
  const tripLimits = trips.map((m) => ({
    tripId: m.tripId,
    memberCount: m.trip.members.length,
    maxMembers: limits.maxMembers === Infinity ? null : limits.maxMembers,
    canInvite: m.trip.members.length < limits.maxMembers,
  }));

  return NextResponse.json({
    plan: isPremium ? "premium" : "free",
    isPremium,
    planExpiry: user.planExpiry,
    limits: {
      maxTrips: limits.maxTrips === Infinity ? null : limits.maxTrips,
      maxMembers: limits.maxMembers === Infinity ? null : limits.maxMembers,
    },
    usage: {
      trips: tripCount,
      canCreateTrip: tripCount < limits.maxTrips,
    },
    trips: tripLimits,
  });
}

// POST /api/limits — создать поездку (с проверкой лимитов)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, title, destination, startDate, totalDays, totalBudget, displayName, emoji, color } = body;

  if (!userId || !title) {
    return NextResponse.json({ error: "userId, title required" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const isPremium = user.plan === "premium" && (!user.planExpiry || user.planExpiry > new Date());
  const maxTrips = isPremium ? Infinity : FREE_LIMITS.maxTrips;

  // Проверка лимита поездок
  const tripCount = await db.tripMember.count({ where: { userId, role: "owner" } });
  if (tripCount >= maxTrips) {
    return NextResponse.json({
      error: "Лимит поездок исчерпан",
      upgrade: true,
      current: tripCount,
      max: maxTrips === Infinity ? null : maxTrips,
    }, { status: 403 });
  }

  // Создаём поездку
  const trip = await db.trip.create({
    data: {
      title,
      destination: destination || "China",
      startDate: new Date(startDate || Date.now()),
      totalDays: totalDays || 12,
      totalBudget: totalBudget || 1100,
      members: {
        create: {
          userId,
          role: "owner",
          displayName: displayName || "Я",
          emoji: emoji || "👤",
          color: color || "#f97316",
        },
      },
    },
    include: { members: true },
  });

  return NextResponse.json(trip);
}

// PATCH /api/limits — проверить лимит участников при приглашении
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { tripId, inviterUserId } = body;

  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  // Кто приглашает — проверяем его план
  const inviter = inviterUserId ? await db.user.findUnique({ where: { id: inviterUserId } }) : null;
  const isPremium = inviter?.plan === "premium" && (!inviter?.planExpiry || inviter.planExpiry > new Date());
  const maxMembers = isPremium ? Infinity : FREE_LIMITS.maxMembers;

  // Считаем участников
  const memberCount = await db.tripMember.count({ where: { tripId } });

  if (memberCount >= maxMembers) {
    return NextResponse.json({
      canInvite: false,
      error: `Лимит участников (${maxMembers}) исчерпан. Перейди на Premium.`,
      upgrade: true,
      current: memberCount,
      max: maxMembers === Infinity ? null : maxMembers,
    }, { status: 403 });
  }

  return NextResponse.json({
    canInvite: true,
    current: memberCount,
    max: maxMembers === Infinity ? null : maxMembers,
  });
}
