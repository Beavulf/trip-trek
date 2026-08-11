import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember } from "@/lib/api-auth";

// GET /api/board?tripId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") || "";

  const messages = await db.boardMessage.findMany({
    where: { tripId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: { user: true },
  });
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { content, userId, tripId } = body;
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;
  if (!content || !tripId) return NextResponse.json({ error: "content, tripId required" }, { status: 400 });
  const msg = await db.boardMessage.create({
    data: { content: content.trim(), userId: userId || null, tripId },
    include: { user: true },
  });
  emitWS("board:added", tripId, { userName: msg.user?.name || "Кто-то", content: content.trim() });
  return NextResponse.json(msg);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, pinned } = body;

  // Lookup tripId from existing message for auth
  const existing = await db.boardMessage.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const msg = await db.boardMessage.update({ where: { id }, data: { pinned } });
  return NextResponse.json(msg);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Lookup tripId from existing message for auth
  const existing = await db.boardMessage.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const msg = await db.boardMessage.delete({ where: { id } });
  emitWS("board:deleted", msg.tripId, { messageId: id });
  return NextResponse.json({ ok: true });
}
