import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember, requireUser } from "@/lib/api-auth";

// GET /api/board?tripId=...
// P0 #1: auth + membership (was open)
// P0 #2: tripId required (was fallback "")
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const messages = await db.boardMessage.findMany({
    where: { tripId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: { user: true },
  });
  return NextResponse.json(messages);
}

// POST /api/board — добавить сообщение
// P0 #3: userId из session (было из body — spoofable)
// P1 #12: content validation (trim, max 4000)
// P1 #9: emit WS с userId для anti-double-toast
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { content, tripId } = body;
  const { user, response } = await requireTripMember(req, tripId);
  if (response) return response;

  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  // P1 #12: content validation
  const trimmed = typeof content === "string" ? content.trim() : "";
  if (!trimmed) {
    return NextResponse.json({ error: "content не может быть пустым" }, { status: 400 });
  }
  if (trimmed.length > 4000) {
    return NextResponse.json({ error: "content слишком длинный (макс 4000 символов)" }, { status: 400 });
  }

  // P0 #3: userId из session (не из body)
  const msg = await db.boardMessage.create({
    data: { content: trimmed, userId: user!.id, tripId },
    include: { user: true },
  });

  // P1 #9: emit WS с userId — клиент может исключить себя из toast
  await emitWS("board:added", tripId, {
    messageId: msg.id,
    userId: user!.id,
    userName: msg.user?.name || "Кто-то",
    content: trimmed,
  });
  return NextResponse.json(msg);
}

// PATCH — toggle pin
// P0 #1: membership check (было)
// P1 #7: emit board:pinned (не board:added — иначе ложный toast "новое сообщение")
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, pinned } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Lookup tripId from existing message for auth
  const existing = await db.boardMessage.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const msg = await db.boardMessage.update({ where: { id }, data: { pinned: !!pinned } });

  // P1 #7: emit board:pinned (не board:added!)
  await emitWS("board:pinned", existing.tripId, { messageId: id, pinned: !!pinned });
  return NextResponse.json(msg);
}

// DELETE /api/board?id=...
// P0 #4: ownership check — author or owner only (было любой участник)
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { user, response: authResp } = await requireUser(req);
  if (authResp) return authResp;

  const existing = await db.boardMessage.findUnique({
    where: { id },
    select: { tripId: true, userId: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Membership check
  const { response: memberResp } = await requireTripMember(req, existing.tripId);
  if (memberResp) return memberResp;

  // P0 #4: ownership — author or trip owner can delete
  const membership = await db.tripMember.findUnique({
    where: { tripId_userId: { tripId: existing.tripId, userId: user!.id } },
    select: { role: true },
  });
  const isAuthor = existing.userId === user!.id;
  const isOwner = membership?.role === "owner";
  if (!isAuthor && !isOwner) {
    return NextResponse.json({ error: "Можно удалять только свои сообщения" }, { status: 403 });
  }

  const msg = await db.boardMessage.delete({ where: { id } });
  await emitWS("board:deleted", msg.tripId, { messageId: id });
  return NextResponse.json({ ok: true });
}
