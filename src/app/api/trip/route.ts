import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { calculateCurrentDayNumber } from "@/lib/trip-days";
import { publish } from "@/lib/ws-bus";

// GET /api/trip?tripId=... — сводка поездки
// Слим-формат (аудит перфоманса 2026-09-13): дни отдаются БЕЗ мест — только
// мета дня и счётчики (placesCount/visitedCount). Дни с местами читает
// GET /api/route (useRoute/useRouteDays); раньше одни и те же дни+места
// приезжали дважды, и оба ответа инвалидовались на каждое событие.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") || "";

  if (!tripId) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  const { user, membership, response } = await requireTripMember(req, tripId);
  if (response) return response;

  const trip = await db.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const [members, days, visitedByDay, totalPlaces, visitedPlaces, expenseAgg, photos, journals] =
    await Promise.all([
      db.tripMember.findMany({
        where: { tripId },
        orderBy: { joinedAt: "asc" },
        // select на user вместо include user:true — в память сервера не тянет
        // лишние поля ряда юзера (сегодня там даже bcrypt-хеш)
        include: { user: { select: { name: true, email: true, avatarUrl: true } } },
      }),
      db.day.findMany({
        where: { tripId },
        orderBy: { dayNumber: "asc" },
        select: {
          id: true,
          dayNumber: true,
          date: true,
          city: true,
          cityKey: true,
          title: true,
          summary: true,
          accentColor: true,
          _count: { select: { places: true, photos: true, expenses: true } },
        },
      }),
      db.place.groupBy({ by: ["dayId"], _count: { _all: true }, where: { tripId, status: "visited" } }),
      db.place.count({ where: { tripId } }),
      db.place.count({ where: { tripId, status: "visited" } }),
      // P1 #5: settlement (переводы между участниками) не считается тратой;
      // aggregate вместо findMany со всеми строками — нужен только итог
      db.expense.aggregate({
        _sum: { amount: true },
        where: { tripId, category: { not: "settlement" } },
      }),
      db.photo.count({ where: { tripId } }),
      db.journalEntry.count({ where: { tripId } }),
    ]);

  const totalSpent = expenseAgg._sum.amount ?? 0;

  // totalBudget = сумма бюджетов участников (если у всех есть budget), иначе из настроек
  const allHaveBudget = members.length > 0 && members.every((m) => m.budget != null);
  const calculatedBudget = allHaveBudget
    ? members.reduce((sum, m) => sum + (m.budget ?? 0), 0)
    : trip.totalBudget;

  const now = new Date();
  // P1 #6: shared currentDayNumber formula (была своя здесь + другая в ai-summary)
  const currentDayNumber = calculateCurrentDayNumber(trip.startDate, trip.totalDays);
  const start = new Date(trip.startDate);
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startUTC = Date.UTC(start.getUTCFullYear(), start.getUTCDate());
  const diffDays = Math.floor((nowUTC - startUTC) / (1000 * 60 * 60 * 24));

  const dayProgress = Math.min(100, Math.round(((diffDays + 1) / trip.totalDays) * 100));
  const placeProgress = totalPlaces > 0 ? Math.round((visitedPlaces / totalPlaces) * 100) : 0;

  // Формируем participants-совместимый формат
  const isReplacementOnly = (s: string) => /^[\uFFFD\s]*$/.test(s);
  // PII (аудит 2026-09-13): email участников — только владельцу, а не всем подряд
  const isOwner = membership!.role === "owner";
  // Приглашать могут все участники, пока владелец не запретил; при запрете код
  // не-владельцам не отдаём вовсе — без кода нет и приглашения (join только по коду)
  const canInvite = isOwner || trip.allowMemberInvites;
  const visitedMap = new Map(visitedByDay.map((v) => [v.dayId, v._count._all]));
  const participants = members.map((m) => ({
    id: m.userId,
    name: isReplacementOnly(m.displayName) ? m.user.name : m.displayName,
    color: m.color,
    emoji: m.emoji,
    role: m.role,
    budget: m.budget,
    email: isOwner ? m.user.email : null,
    // avatarUrl — аватар вместо эмодзи (лента, бюджет); joinedAt — событие «присоединился» в ленте
    avatarUrl: m.user.avatarUrl,
    joinedAt: m.joinedAt,
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
      inviteCode: canInvite ? trip.inviteCode : null,
      allowMemberInvites: trip.allowMemberInvites,
      tripId: trip.id,
    },
    trip: {
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      inviteCode: canInvite ? trip.inviteCode : null,
      coverColor: trip.coverColor,
      coverEmoji: trip.coverEmoji,
      status: trip.status,
    },
    participants,
    // members с вложенным user наружу не отдаём — только participants
    currentDayNumber,
    dayProgress,
    placeProgress,
    visitedPlaces,
    totalPlaces,
    totalSpent,
    remainingBudget: calculatedBudget - totalSpent,
    totalPhotos: photos,
    totalJournals: journals,
    days: days.map((d) => ({
      id: d.id,
      dayNumber: d.dayNumber,
      date: d.date,
      city: d.city,
      cityKey: d.cityKey,
      title: d.title,
      summary: d.summary,
      accentColor: d.accentColor,
      placesCount: d._count.places,
      visitedCount: visitedMap.get(d.id) ?? 0,
    })),
  });
}

// PATCH /api/trip?tripId=... { status } или { title } — меняет только владелец
const TRIP_STATUSES = ["planning", "active", "completed"];

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") || "";
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const { user, membership, response } = await requireTripMember(req, tripId);
  if (response) return response;
  if (membership!.role !== "owner") {
    return NextResponse.json({ error: "Поездку меняет только владелец" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { status, title, allowMemberInvites } = body as {
    status?: string;
    title?: string;
    allowMemberInvites?: boolean;
  };

  const data: { status?: string; title?: string; allowMemberInvites?: boolean } = {};
  if (status !== undefined) {
    if (!status || !TRIP_STATUSES.includes(status)) {
      return NextResponse.json({ error: "status: planning | active | completed" }, { status: 400 });
    }
    data.status = status;
  }
  if (typeof title === "string") {
    const clean = title.trim().slice(0, 120);
    if (!clean) return NextResponse.json({ error: "Название не может быть пустым" }, { status: 400 });
    data.title = clean;
  }
  if (typeof allowMemberInvites === "boolean") {
    data.allowMemberInvites = allowMemberInvites;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять: жду status, title или allowMemberInvites" }, { status: 400 });
  }

  const updated = await db.trip.update({ where: { id: tripId }, data });
  publish(tripId, "trip:updated", {});
  return NextResponse.json({
    ok: true,
    title: updated.title,
    status: updated.status,
    allowMemberInvites: updated.allowMemberInvites,
  });
}
