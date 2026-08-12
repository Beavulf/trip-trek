import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";

// GET /api/trips — только поездки текущего пользователя (из сессии, не из query)
export async function GET(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const memberships = await db.tripMember.findMany({
    where: { userId: user!.id },
    include: {
      trip: {
        include: {
          members: { include: { user: true } },
          _count: { select: { places: true, photos: true, expenses: true, journals: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const trips = memberships.map((m) => ({
    ...m.trip,
    myRole: m.role,
    myDisplayName: m.displayName,
  }));
  return NextResponse.json(trips);
}

// POST /api/trips — создать поездку; owner = session user
export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const body = await req.json();
  const { title, destination, startDate, endDate, totalDays, totalBudget, currency, displayName, emoji, color } = body;

  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const trip = await db.trip.create({
    data: {
      title,
      destination: destination || "Unknown",
      startDate: new Date(startDate || Date.now()),
      endDate: endDate ? new Date(endDate) : null,
      totalDays: totalDays || 12,
      totalBudget: totalBudget || 1100,
      currency: currency || "USD",
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
