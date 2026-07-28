import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/trip/dates — обновить даты поездки
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { tripId, startDate, endDate } = body;
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (startDate) {
    const d = new Date(startDate);
    d.setHours(0, 0, 0, 0);
    data.startDate = d;
  }
  if (endDate) {
    const d = new Date(endDate);
    d.setHours(23, 59, 59, 999);
    data.endDate = d;
    // пересчитать totalDays
    if (startDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      data.totalDays = Math.max(1, Math.round((d.getTime() - s.getTime()) / 86400000) + 1);
    } else {
      const trip = await db.trip.findUnique({ where: { id: tripId }, select: { startDate: true } });
      if (trip?.startDate) {
        const s = new Date(trip.startDate);
        s.setHours(0, 0, 0, 0);
        data.totalDays = Math.max(1, Math.round((d.getTime() - s.getTime()) / 86400000) + 1);
      }
    }
  }

  const trip = await db.trip.update({ where: { id: tripId }, data });
  return NextResponse.json(trip);
}
