import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { calculateCurrentDayNumber } from "@/lib/trip-days";

// GET /api/route?tripId=... — модель чтения маршрута (кандидат №1 аудита 2026-09-12).
// Дни+места+мета поездки одним запросом: раньше карта/маршрут/диалог читали
// /api/days и /api/trip параллельно — две разные проекции одних и тех же данных.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") || "";
  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      title: true,
      destination: true,
      currency: true,
      startDate: true,
      endDate: true,
      totalDays: true,
    },
  });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const days = await db.day.findMany({
    where: { tripId },
    orderBy: { dayNumber: "asc" },
    include: {
      places: { where: { tripId }, orderBy: { order: "asc" } },
      photos: { where: { tripId }, orderBy: { takenAt: "desc" }, take: 8 },
      _count: { select: { places: true, photos: true, expenses: true } },
    },
  });

  return NextResponse.json({
    days,
    meta: {
      title: trip.title,
      destination: trip.destination,
      currency: trip.currency,
      startDate: trip.startDate,
      endDate: trip.endDate,
      totalDays: trip.totalDays,
      // Единая формула текущего дня (src/lib/trip-days.ts)
      currentDayNumber: calculateCurrentDayNumber(trip.startDate, trip.totalDays),
    },
  });
}
