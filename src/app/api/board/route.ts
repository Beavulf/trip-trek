import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/board?tripId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") || "default-trip";

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
  if (!content || !tripId) return NextResponse.json({ error: "content, tripId required" }, { status: 400 });
  const msg = await db.boardMessage.create({
    data: { content: content.trim(), userId: userId || null, tripId },
    include: { user: true },
  });
  return NextResponse.json(msg);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, pinned } = body;
  const msg = await db.boardMessage.update({ where: { id }, data: { pinned } });
  return NextResponse.json(msg);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.boardMessage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
