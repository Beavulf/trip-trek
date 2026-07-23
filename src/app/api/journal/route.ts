import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/journal — записи дневника
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dayId = searchParams.get("dayId");
  const entries = await db.journalEntry.findMany({
    where: dayId ? { dayId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { participant: true, day: { select: { dayNumber: true, city: true } } },
  });
  return NextResponse.json(entries);
}

// POST
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { dayId, content, mood, participantId } = body;
  if (!dayId || !content) {
    return NextResponse.json({ error: "dayId, content required" }, { status: 400 });
  }
  const entry = await db.journalEntry.create({
    data: { dayId, content, mood: mood || null, participantId: participantId || null },
    include: { participant: true, day: true },
  });
  return NextResponse.json(entry);
}

// DELETE
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.journalEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
