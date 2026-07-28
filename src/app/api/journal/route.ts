import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";

// GET /api/journal?tripId=...&dayId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const dayId = searchParams.get("dayId");
  const where: Record<string, unknown> = {};
  if (tripId) where.tripId = tripId;
  if (dayId) where.dayId = dayId;

  const entries = await db.journalEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { user: true, day: { select: { dayNumber: true, city: true } } },
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { dayId, content, mood, userId, tripId } = body;
  if (!dayId || !content || !tripId) {
    return NextResponse.json({ error: "dayId, content, tripId required" }, { status: 400 });
  }
  const entry = await db.journalEntry.create({
    data: { dayId, tripId, content, mood: mood || null, userId: userId || null },
    include: { user: true, day: true },
  });
  emitWS("journal:added", tripId, { userName: entry.user?.name || "Кто-то", mood: mood || "" });
  return NextResponse.json(entry);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const entry = await db.journalEntry.delete({ where: { id } });
  emitWS("journal:deleted", entry.tripId, { journalId: id });
  return NextResponse.json({ ok: true });
}
