import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember, requireUser } from "@/lib/api-auth";

// GET /api/participants?tripId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") || "";
  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const members = await db.tripMember.findMany({
    where: { tripId },
    orderBy: { joinedAt: "asc" },
  });
  return NextResponse.json(members);
}

// PATCH /api/participants — текущий пользователь = сессия; эндпоинт больше не пишет в БД
export async function PATCH(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  return NextResponse.json({ ok: true, currentUserId: user!.id, ignored: body?.currentUserId });
}
