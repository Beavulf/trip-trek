import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";

const PHOTO_INCLUDE = {
  place: true,
  user: { select: { id: true, name: true, color: true, emoji: true } },
  day: { select: { dayNumber: true, city: true, cityKey: true } },
};

// PATCH /api/photos/[id] — подпись/день (автор или owner), избранное (любой участник)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const existing = await db.photo.findUnique({ where: { id }, select: { tripId: true, userId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { user, membership, response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const isAuthor = existing.userId === user!.id;
  const isOwner = membership!.role === "owner";

  const data: Record<string, unknown> = {};

  if ("isFavorite" in body) {
    if (typeof body.isFavorite !== "boolean") {
      return NextResponse.json({ error: "isFavorite must be boolean" }, { status: 400 });
    }
    data.isFavorite = body.isFavorite;
  }

  if ("caption" in body || "dayId" in body) {
    if (!isAuthor && !isOwner) {
      return NextResponse.json({ error: "Подпись и день меняет автор или владелец" }, { status: 403 });
    }
    if ("caption" in body) {
      const caption = typeof body.caption === "string" ? body.caption.trim().slice(0, 300) : null;
      data.caption = caption || null;
    }
    if ("dayId" in body) {
      const day = await db.day.findFirst({ where: { id: body.dayId, tripId: existing.tripId }, select: { id: true } });
      if (!day) return NextResponse.json({ error: "День не найден в этой поездке" }, { status: 400 });
      data.dayId = body.dayId;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const photo = await db.photo.update({ where: { id }, data, include: PHOTO_INCLUDE });
  return NextResponse.json(photo);
}
