import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, requireTripMember } from "@/lib/api-auth";

const FREE_LIMITS = {
  maxTrips: 1,
  maxMembers: 5,
};

const PREMIUM_LIMITS = {
  maxTrips: Infinity,
  maxMembers: Infinity,
};

function isUserPremium(user: { plan: string; planExpiry: Date | null }) {
  return user.plan === "premium" && (!user.planExpiry || user.planExpiry > new Date());
}

// GET /api/limits — лимиты текущего пользователя (сессия)
export async function GET(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const dbUser = await db.user.findUnique({ where: { id: user!.id } });
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const premium = isUserPremium(dbUser);
  const limits = premium ? PREMIUM_LIMITS : FREE_LIMITS;
  const tripCount = await db.tripMember.count({ where: { userId: user!.id, role: "owner" } });

  const trips = await db.tripMember.findMany({
    where: { userId: user!.id, role: "owner" },
    include: { trip: { select: { members: true } } },
  });
  const tripLimits = trips.map((m) => ({
    tripId: m.tripId,
    memberCount: m.trip.members.length,
    maxMembers: limits.maxMembers === Infinity ? null : limits.maxMembers,
    canInvite: m.trip.members.length < limits.maxMembers,
  }));

  return NextResponse.json({
    plan: premium ? "premium" : "free",
    isPremium: premium,
    planExpiry: dbUser.planExpiry,
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

// POST /api/limits — создать поездку с проверкой лимитов (owner = session)
export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const body = await req.json();
  const { title, destination, startDate, totalDays, totalBudget, displayName, emoji, color, coverEmoji, coverColor } = body;

  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const dbUser = await db.user.findUnique({ where: { id: user!.id } });
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const premium = isUserPremium(dbUser);
  const maxTrips = premium ? Infinity : FREE_LIMITS.maxTrips;

  const tripCount = await db.tripMember.count({ where: { userId: user!.id, role: "owner" } });
  if (tripCount >= maxTrips) {
    return NextResponse.json(
      {
        error: "Лимит поездок исчерпан",
        upgrade: true,
        current: tripCount,
        max: maxTrips === Infinity ? null : maxTrips,
      },
      { status: 403 }
    );
  }

  const trip = await db.trip.create({
    data: {
      title,
      destination: destination || "Unknown",
      startDate: new Date(startDate || Date.now()),
      totalDays: totalDays || 12,
      totalBudget: totalBudget || 1100,
      coverEmoji: coverEmoji || emoji || "🌏",
      coverColor: coverColor || color || "#f97316",
      members: {
        create: {
          userId: user!.id,
          role: "owner",
          displayName: displayName || user!.name || "Я",
          emoji: emoji || "👤",
          color: color || "#f97316",
        },
      },
    },
    include: { members: true },
  });

  return NextResponse.json(trip);
}

// PATCH /api/limits — лимит участников при приглашении
export async function PATCH(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const body = await req.json();
  const { tripId } = body;
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const { response: memberResp } = await requireTripMember(req, tripId);
  if (memberResp) return memberResp;

  const dbUser = await db.user.findUnique({ where: { id: user!.id } });
  const premium = dbUser ? isUserPremium(dbUser) : false;
  const maxMembers = premium ? Infinity : FREE_LIMITS.maxMembers;

  const memberCount = await db.tripMember.count({ where: { tripId } });

  if (memberCount >= maxMembers) {
    return NextResponse.json(
      {
        canInvite: false,
        error: `Лимит участников (${maxMembers}) исчерпан. Перейди на Premium.`,
        upgrade: true,
        current: memberCount,
        max: maxMembers === Infinity ? null : maxMembers,
      },
      { status: 403 }
    );
  }

  return NextResponse.json({
    canInvite: true,
    current: memberCount,
    max: maxMembers === Infinity ? null : maxMembers,
  });
}
