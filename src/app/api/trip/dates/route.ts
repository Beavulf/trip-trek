import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripOwner } from "@/lib/api-auth";

// PATCH /api/trip/dates — обновить даты поездки (только владелец)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { tripId, startDate, endDate } = body;
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { response } = await requireTripOwner(req, tripId);
  if (response) return response;

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

  // === Синхронизация дней после изменения дат ===
  // Если totalDays увеличился — создаём недостающие дни
  // Если уменьшился — удаляем лишние дни (без мест)
  const existingDays = await db.day.findMany({
    where: { tripId },
    orderBy: { dayNumber: "asc" },
    select: { id: true, dayNumber: true, date: true, city: true, cityKey: true, title: true, accentColor: true, _count: { select: { places: true } } },
  });

  const newTotalDays = (data.totalDays as number | undefined) ?? trip.totalDays;
  const startDateResolved = (data.startDate as Date | undefined) ?? trip.startDate;

  // Создаём недостающие дни
  if (existingDays.length < newTotalDays) {
    const existingDayNumbers = new Set(existingDays.map((d) => d.dayNumber));
    const createData: Array<{
      tripId: string;
      dayNumber: number;
      date: Date;
      city: string;
      cityKey: string;
      title: string;
      summary: string | null;
      accentColor: string | null;
    }> = [];
    for (let n = 1; n <= newTotalDays; n++) {
      if (existingDayNumbers.has(n)) continue;
      const dayDate = new Date(startDateResolved);
      dayDate.setUTCDate(dayDate.getUTCDate() + (n - 1));
      dayDate.setUTCHours(0, 0, 0, 0);
      createData.push({
        tripId,
        dayNumber: n,
        date: dayDate,
        city: "Не задан",
        cityKey: "",
        title: `День ${n}`,
        summary: null,
        accentColor: null,
      });
    }
    if (createData.length > 0) {
      await db.day.createMany({ data: createData });
    }
  }

  // Удаляем лишние дни (только без мест)
  if (existingDays.length > newTotalDays) {
    const daysToDelete = existingDays.filter((d) => d.dayNumber > newTotalDays);
    const deletableIds = daysToDelete.filter((d) => d._count.places === 0).map((d) => d.id);
    if (deletableIds.length > 0) {
      await db.day.deleteMany({ where: { id: { in: deletableIds }, tripId } });
    }
  }

  return NextResponse.json(trip);
}
