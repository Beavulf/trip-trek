import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/photos/geo?tripId=... — фото с координатами для карты (по поездке)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");

  const where: Record<string, unknown> = {
    AND: [
      { lat: { not: null } },
      { lng: { not: null } },
    ],
  };
  if (tripId) where.tripId = tripId;

  const photos = await db.photo.findMany({
    where,
    orderBy: { takenAt: "desc" },
    include: {
      user: { select: { id: true, name: true, emoji: true, color: true } },
      day: { select: { dayNumber: true, city: true, cityKey: true } },
    },
  });
  return NextResponse.json(photos);
}
