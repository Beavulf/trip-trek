import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember, requireUser } from "@/lib/api-auth";
import { isValidMood } from "@/lib/moods";

// GET /api/journal?tripId=...&dayId=...
// P0 #2: tripId обязателен — без него 400 (раньше пустая строка → where={} → все записи всех поездок)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const dayId = searchParams.get("dayId");

  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }
  // Auth + membership
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const where: Record<string, unknown> = { tripId };
  if (dayId) where.dayId = dayId;

  const entries = await db.journalEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { user: true, day: { select: { dayNumber: true, city: true } } },
  });
  return NextResponse.json(entries);
}

// POST /api/journal — добавить запись
// P0 #1: userId берём из session (раньше UI передавал trip.settings.currentUserId который всегда null)
// P0 #3: проверяем что dayId принадлежит tripId
// P1 #9: await emitWS
// P1 #10: валидация content (trim, max 5000) + mood whitelist
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { dayId, content, mood, userId, tripId } = body;
  const { user, response } = await requireTripMember(req, tripId);
  if (response) return response;

  if (!dayId || !content || !tripId) {
    return NextResponse.json({ error: "dayId, content, tripId required" }, { status: 400 });
  }
  // P1 #10: content validation
  const trimmed = typeof content === "string" ? content.trim() : "";
  if (!trimmed) {
    return NextResponse.json({ error: "content не может быть пустым" }, { status: 400 });
  }
  if (trimmed.length > 5000) {
    return NextResponse.json({ error: "content слишком длинный (макс 5000 символов)" }, { status: 400 });
  }
  // P1 #10: mood whitelist
  const safeMood = mood && isValidMood(mood) ? mood : null;

  // P0 #3: validate dayId ∈ tripId
  const day = await db.day.findUnique({
    where: { id: dayId },
    select: { tripId: true },
  });
  if (!day || day.tripId !== tripId) {
    return NextResponse.json({ error: "day не принадлежит этой поездке" }, { status: 400 });
  }

  // P0 #1: userId из session (не из body)
  const authorId = user!.id;

  const entry = await db.journalEntry.create({
    data: { dayId, tripId, content: trimmed, mood: safeMood, userId: authorId },
    include: { user: true, day: true },
  });

  // P1 #9: await emitWS
  await emitWS("journal:added", tripId, {
    journalId: entry.id,
    userName: entry.user?.name || "Кто-то",
    mood: safeMood || "",
  });

  return NextResponse.json(entry);
}

// DELETE /api/journal?id=...
// P0 #4: ownership check — только автор или owner поездки может удалить
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { user, response: authResp } = await requireUser(req);
  if (authResp) return authResp;

  const existing = await db.journalEntry.findUnique({
    where: { id },
    select: { tripId: true, userId: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Membership check
  const { response: memberResp } = await requireTripMember(req, existing.tripId);
  if (memberResp) return memberResp;

  // P0 #4: ownership — только автор или owner поездки может удалить
  // (не любой участник поездки)
  const membership = await db.tripMember.findUnique({
    where: { tripId_userId: { tripId: existing.tripId, userId: user!.id } },
    select: { role: true },
  });
  const isAuthor = existing.userId === user!.id;
  const isOwner = membership?.role === "owner";
  if (!isAuthor && !isOwner) {
    return NextResponse.json({ error: "Можно удалять только свои записи" }, { status: 403 });
  }

  await db.journalEntry.delete({ where: { id } });
  await emitWS("journal:deleted", existing.tripId, { journalId: id });
  return NextResponse.json({ ok: true });
}
