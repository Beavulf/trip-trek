import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/days?tripId=...
export async function GET(req: NextRequest) {
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

// POST /api/days — добавить новый день
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tripId, city, cityKey, title, summary, accentColor } = body;

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
  const lastDate = maxDay?.date ? new Date(maxDay.date) : new Date(trip.startDate);
  const newDate = new Date(lastDate.getTime() + 24 * 60 * 60 * 1000);

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

  // Обновим totalDays в поездке
  await db.trip.update({
    where: { id: tripId },
    data: { totalDays: newDayNumber },
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

  // Не даём удалить если это единственный день
  const count = await db.day.count({ where: { tripId: day.tripId } });
  if (count <= 1) {
    return NextResponse.json({ error: "Нельзя удалить единственный день" }, { status: 400 });
  }

  await db.day.delete({ where: { id } });

  // Перенумеруем оставшиеся дни
  const remaining = await db.day.findMany({
    where: { tripId: day.tripId },
    orderBy: { dayNumber: "asc" },
  });
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].dayNumber !== i + 1) {
      await db.day.update({ where: { id: remaining[i].id }, data: { dayNumber: i + 1 } });
    }
  }

  // Обновим totalDays
  await db.trip.update({
    where: { id: day.tripId },
    data: { totalDays: remaining.length },
  });

  return NextResponse.json({ ok: true });
}

// PATCH /api/days — обновить день (город, название)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, city, cityKey, title, summary, accentColor } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof city === "string") data.city = city;
  if (typeof cityKey === "string") data.cityKey = cityKey;
  if (typeof title === "string") data.title = title;
  if (typeof summary === "string") data.summary = summary;
  if (typeof accentColor === "string") data.accentColor = accentColor;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const day = await db.day.update({ where: { id }, data });
  return NextResponse.json(day);
}
