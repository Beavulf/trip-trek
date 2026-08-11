import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/participants?tripId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") || "";

  const members = await db.tripMember.findMany({
    where: { tripId },
    orderBy: { joinedAt: "asc" },
  });
  return NextResponse.json(members);
}

// PATCH /api/participants — установить текущего пользователя.
// В новой multi-trip архитектуре текущий пользователь определяется сессией/auth,
// поэтому эндпоинт больше не пишет в БД, но сохраняет контракт с фронтендом.
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { currentUserId } = body;
  return NextResponse.json({ ok: true, currentUserId });
}
