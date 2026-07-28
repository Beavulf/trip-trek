import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/days?tripId=default-trip
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") || "default-trip";

  const days = await db.day.findMany({
    where: { tripId },
    orderBy: { dayNumber: "asc" },
    include: {
      places: { where: { tripId }, orderBy: { order: "asc" } },
      photos: { where: { tripId }, orderBy: { takenAt: "desc" }, take: 8 },
      _count: { select: { places: true, photos: true, expenses: true } },
    },
  });
  return NextResponse.json(days);
}
