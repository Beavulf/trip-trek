import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember } from "@/lib/api-auth";
import { pickPatchablePlace } from "@/lib/place-fields";

// PATCH /api/places/[id] — обновить место. Белый список и капы — общий контракт place-fields.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  // Lookup tripId from existing place for auth
  const existing = await db.place.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const data = pickPatchablePlace(body);
  if (data.status === "visited" && !data.visitedAt) {
    data.visitedAt = new Date();
  }
  // Переносить место можно только в день той же поездки (аудит 2026-09-12; как в photos/[id])
  if (typeof data.dayId === "string") {
    const day = await db.day.findFirst({ where: { id: data.dayId, tripId: existing.tripId }, select: { id: true } });
    if (!day) return NextResponse.json({ error: "day не принадлежит этой поездке" }, { status: 400 });
  }
  const place = await db.place.update({ where: { id }, data });

  // WS: уведомить участников поездки
  const tripId = (place as { tripId?: string }).tripId;
  if (tripId) publish(tripId, "place:updated", { placeId: id, placeName: place.name, userName: body.userName || "Кто-то" });

  return NextResponse.json(place);
}

// DELETE /api/places/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Lookup tripId from existing place for auth
  const existing = await db.place.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const place = await db.place.delete({ where: { id } });
  const tripId = (place as { tripId?: string }).tripId;
  if (tripId) publish(tripId, "place:deleted", { placeId: id });
  return NextResponse.json({ ok: true });
}
