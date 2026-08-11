import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";

// GET /api/trip?tripId=... — сводка поездки
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") || "";

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const trip = await db.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const [members, days, places, photos, expenses, journals] = await Promise.all([
    db.tripMember.findMany({ where: { tripId }, include: { user: true }, orderBy: { joinedAt: "asc" } }),
    db.day.findMany({
      where: { tripId },
      orderBy: { dayNumber: "asc" },
      include: {
        places: { where: { tripId }, orderBy: { order: "asc" }, select: { id: true, name: true, category: true, status: true, timeOfDay: true, budget: true, rating: true, dayId: true, lat: true, lng: true, address: true, description: true, notes: true, visitedAt: true } },
        _count: { select: { places: true, photos: true, expenses: true } },
      },
    }),
    db.place.findMany({ where: { tripId } }),
    db.photo.count({ where: { tripId } }),
    db.expense.findMany({ where: { tripId }, include: { paidBy: true, day: { select: { dayNumber: true, city: true } } } }),
    db.journalEntry.count({ where: { tripId } }),
  ]);

  const visitedPlaces = places.filter((p) => p.status === "visited").length;
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  // totalBudget = сумма бюджетов участников (если у всех есть budget), иначе из настроек
  const allHaveBudget = members.length > 0 && members.every((m) => m.budget != null);
  const calculatedBudget = allHaveBudget
    ? members.reduce((sum, m) => sum + (m.budget ?? 0), 0)
    : trip.totalBudget;

  const now = new Date();
  const start = new Date(trip.startDate);
  start.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const currentDayNumber = Math.max(1, Math.min(trip.totalDays, diffDays + 1));

  const dayProgress = Math.min(100, Math.round(((diffDays + 1) / trip.totalDays) * 100));
  const placeProgress = places.length > 0 ? Math.round((visitedPlaces / places.length) * 100) : 0;

  // Формируем participants-совместимый формат
  const participants = members.map((m) => ({
    id: m.userId,
    name: m.displayName,
    color: m.color,
    emoji: m.emoji,
    role: m.user.name === m.displayName ? undefined : m.user.name,
    budget: m.budget,
    email: m.user.email,
  }));

  return NextResponse.json({
    settings: {
      id: trip.id,
      title: trip.title,
      startDate: trip.startDate,
      endDate: trip.endDate,
      totalDays: trip.totalDays,
      totalBudget: calculatedBudget,
      currency: trip.currency,
      currentUserId: null,
      inviteCode: trip.inviteCode,
      tripId: trip.id,
    },
    trip: {
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      inviteCode: trip.inviteCode,
      coverColor: trip.coverColor,
      coverEmoji: trip.coverEmoji,
      status: trip.status,
    },
    participants,
    members,
    currentDayNumber,
    dayProgress,
    placeProgress,
    visitedPlaces,
    totalPlaces: places.length,
    totalSpent,
    remainingBudget: calculatedBudget - totalSpent,
    totalPhotos: photos,
    totalJournals: journals,
    days,
  });
}
