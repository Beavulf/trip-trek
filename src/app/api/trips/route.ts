import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/trips — список поездок пользователя (по userId из query)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (userId) {
    // Поездки конкретного пользователя
    const memberships = await db.tripMember.findMany({
      where: { userId },
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

  // Все поездки (fallback)
  const trips = await db.trip.findMany({
    include: {
      members: { include: { user: true } },
      _count: { select: { places: true, photos: true, expenses: true, journals: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(trips);
}

// POST /api/trips — создать новую поездку
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, destination, startDate, endDate, totalDays, totalBudget, currency, userId, displayName, emoji, color } = body;

  if (!title || !userId) {
    return NextResponse.json({ error: "title, userId required" }, { status: 400 });
  }

  const trip = await db.trip.create({
    data: {
      title,
      destination: destination || "China",
      startDate: new Date(startDate || Date.now()),
      endDate: endDate ? new Date(endDate) : null,
      totalDays: totalDays || 12,
      totalBudget: totalBudget || 1100,
      currency: currency || "USD",
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
