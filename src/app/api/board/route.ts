import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/board — все сообщения (pinned сверху, потом по времени)
export async function GET() {
  const messages = await db.boardMessage.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: { participant: true },
  });
  return NextResponse.json(messages);
}

// POST — добавить сообщение
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { content, participantId } = body;
  if (!content || !content.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  const msg = await db.boardMessage.create({
    data: { content: content.trim(), participantId: participantId || null },
    include: { participant: true },
  });
  return NextResponse.json(msg);
}

// PATCH — закрепить/открепить
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, pinned } = body;
  const msg = await db.boardMessage.update({ where: { id }, data: { pinned } });
  return NextResponse.json(msg);
}

// DELETE
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.boardMessage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
