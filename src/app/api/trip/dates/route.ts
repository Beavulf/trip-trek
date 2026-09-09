import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripOwner } from "@/lib/api-auth";
import { dayDateFor } from "@/lib/trip-days";

const startOfDay = (x: Date | string) => {
  const d = new Date(x);
  d.setHours(0, 0, 0, 0);
  return d;
};

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
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      data.startDate = d;
    }
  }

  const resolveStart = async (): Promise<Date | null> => {
    if (data.startDate) return new Date(data.startDate as Date);
    const t = await db.trip.findUnique({ where: { id: tripId }, select: { startDate: true } });
    return t?.startDate ? new Date(t.startDate) : null;
  };

  if (endDate) {
    const d = new Date(endDate);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      data.endDate = d;
      // пересчитать totalDays: диапазон включительно; endDate — конец дня, поэтому floor
      const s = await resolveStart();
      if (s) {
        const s0 = startOfDay(s);
        data.totalDays = Math.max(1, Math.floor((d.getTime() - s0.getTime()) / 86400000) + 1);
      }
    }
  }

  const oldTrip = await db.trip.findUnique({ where: { id: tripId }, select: { startDate: true } });
  if (!oldTrip) return NextResponse.json({ error: "trip not found" }, { status: 404 });
  const startDateChanged =
    !!data.startDate && startOfDay(data.startDate as Date).getTime() !== startOfDay(oldTrip.startDate).getTime();

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
      createData.push({
        tripId,
        dayNumber: n,
        date: dayDateFor(new Date(startDateResolved), n),
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

  // Смена старта передатирует все существующие дни по канону «старт + (N−1)» —
  // иначе построенный заранее маршрут останется на старых датах
  if (startDateChanged) {
    const allDays = await db.day.findMany({
      where: { tripId },
      orderBy: { dayNumber: "asc" },
      select: { id: true, dayNumber: true },
    });
    const newStart = new Date(data.startDate as Date);
    for (const d of allDays) {
      await db.day.update({ where: { id: d.id }, data: { date: dayDateFor(newStart, d.dayNumber) } });
    }
  }

  return NextResponse.json(trip);
}
