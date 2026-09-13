import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { dayDateFor, dayEndFor } from "@/lib/trip-days";

// GET удалён (аудит перфоманса 2026-09-13): модель чтения дней+мест —
// GET /api/route (useRoute/useRouteDays). Здесь остались только мутации.

// POST /api/days — добавить новый день
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tripId, city, cityKey, title, summary, accentColor } = body;

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, totalDays: true } });
  if (!trip) return NextResponse.json({ error: "trip not found" }, { status: 404 });

  // Найти максимальный dayNumber
  const maxDay = await db.day.findFirst({
    where: { tripId },
    orderBy: { dayNumber: "desc" },
    select: { dayNumber: true, date: true },
  });

  const newDayNumber = (maxDay?.dayNumber ?? 0) + 1;
  // Дата дня N канонична: старт поездки + (N−1) суток — день 1 совпадает со стартом,
  // а новые дни не наследуют сдвинутые даты соседей.
  const newDate = dayDateFor(new Date(trip.startDate), newDayNumber);

  const day = await db.day.create({
    data: {
      tripId,
      dayNumber: newDayNumber,
      date: newDate,
      city: city || "Новый город",
      cityKey: cityKey || "custom",
      title: title || `День ${newDayNumber}`,
      summary: summary || "",
      accentColor: accentColor || "#f97316",
    },
  });

  // Обновим totalDays и endDate в поездке: endDate = конец последнего дня маршрута
  const endDate = dayEndFor(new Date(trip.startDate), newDayNumber);
  await db.trip.update({
    where: { id: tripId },
    data: {
      totalDays: newDayNumber,
      endDate,
    },
  });

  return NextResponse.json(day);
}

// DELETE /api/days?id=... — удалить день
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const day = await db.day.findUnique({ where: { id }, select: { tripId: true, dayNumber: true } });
  if (!day) return NextResponse.json({ error: "day not found" }, { status: 404 });

  const { response } = await requireTripMember(req, day.tripId);
  if (response) return response;

  // Не даём удалить если это единственный день
  const count = await db.day.count({ where: { tripId: day.tripId } });
  if (count <= 1) {
    return NextResponse.json({ error: "Нельзя удалить единственный день" }, { status: 400 });
  }

  await db.day.delete({ where: { id } });

  // Перенумеруем оставшиеся дни и передатируем по канону (старт + (N−1)),
  // иначе после удаления середины маршрута номера «уедут» от дат
  const tripRow = await db.trip.findUnique({ where: { id: day.tripId }, select: { startDate: true } });
  const remaining = await db.day.findMany({
    where: { tripId: day.tripId },
    orderBy: { dayNumber: "asc" },
  });
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].dayNumber !== i + 1) {
      await db.day.update({
        where: { id: remaining[i].id },
        data: { dayNumber: i + 1, date: dayDateFor(new Date(tripRow!.startDate), i + 1) },
      });
    }
  }

  // Обновим totalDays и endDate (конец последнего дня)
  await db.trip.update({
    where: { id: day.tripId },
    data: { totalDays: remaining.length, endDate: dayEndFor(new Date(tripRow!.startDate), remaining.length) },
  });

  return NextResponse.json({ ok: true });
}

// PATCH /api/days — обновить день (город, название)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, city, cityKey, title, summary, accentColor } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Lookup tripId from existing day for auth
  const existing = await db.day.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "day not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const data: Record<string, unknown> = {};
  if (typeof city === "string") data.city = city.slice(0, 100);
  if (typeof cityKey === "string") data.cityKey = cityKey.slice(0, 100);
  if (typeof title === "string") data.title = title.slice(0, 200);
  if (typeof summary === "string") data.summary = summary.slice(0, 2000);
  if (typeof accentColor === "string") data.accentColor = accentColor.slice(0, 32);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const day = await db.day.update({ where: { id }, data });
  return NextResponse.json(day);
}
