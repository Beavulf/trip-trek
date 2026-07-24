import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/participants
export async function GET() {
  const participants = await db.participant.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(participants);
}

// PATCH /api/participants — установить текущего пользователя
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { currentUserId } = body;
  await db.tripSettings.update({ where: { id: "default" }, data: { currentUserId } });
  return NextResponse.json({ ok: true, currentUserId });
}
