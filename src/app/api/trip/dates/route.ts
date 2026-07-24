import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/trip/dates — обновить даты поездки
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { startDate, endDate } = body;

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
      const settings = await db.tripSettings.findUnique({ where: { id: "default" } });
      if (settings) {
        const s = new Date(settings.startDate);
        s.setHours(0, 0, 0, 0);
        data.totalDays = Math.max(1, Math.round((d.getTime() - s.getTime()) / 86400000) + 1);
      }
    }
  }

  const settings = await db.tripSettings.update({ where: { id: "default" }, data });
  return NextResponse.json(settings);
}
