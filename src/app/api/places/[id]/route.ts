import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember } from "@/lib/api-auth";

// PATCH /api/places/[id] — обновить место (статус, заметки, рейтинг, адрес, имя, категория, бюджет)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  // Lookup tripId from existing place for auth
  const existing = await db.place.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const allowed = ["status", "notes", "rating", "visitedAt", "timeOfDay", "address", "name", "category", "budget", "description", "lat", "lng"];
  const data: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) data[k] = body[k];
  }
  if (data.status === "visited" && !data.visitedAt) {
    data.visitedAt = new Date();
  }
  const place = await db.place.update({ where: { id }, data });

  // WS: уведомить участников поездки
  const tripId = (place as { tripId?: string }).tripId;
  if (tripId) emitWS("place:updated", tripId, { placeId: id, placeName: place.name, userName: body.userName || "Кто-то" });

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
  if (tripId) emitWS("place:deleted", tripId, { placeId: id });
  return NextResponse.json({ ok: true });
}
