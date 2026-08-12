import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember } from "@/lib/api-auth";

// GET /api/info?tripId=...&type=...
// P0 #1: tripId required (was leak when empty); P0 #2: auth + membership
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const type = searchParams.get("type");
  const where: Record<string, unknown> = { tripId };
  if (type) where.type = type;

  const items = await db.infoItem.findMany({
    where,
    orderBy: [{ type: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, title, content, icon, tripId } = body;
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;
  if (!type || !title || !content || !tripId) {
    return NextResponse.json({ error: "type, title, content, tripId required" }, { status: 400 });
  }
  const order = await db.infoItem.count({ where: { tripId, type } });
  const item = await db.infoItem.create({ data: { type, title, content, icon: icon || null, tripId, order } });
  emitWS("info:updated", tripId, {});
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, title, content, icon, type } = body;

  // Lookup tripId from existing item for auth
  const existing = await db.infoItem.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const data: Record<string, unknown> = {};
  if (typeof title === "string") data.title = title;
  if (typeof content === "string") data.content = content;
  if (icon !== undefined) data.icon = icon;
  if (typeof type === "string") data.type = type;
  const item = await db.infoItem.update({ where: { id }, data });
  emitWS("info:updated", item.tripId, {});
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Lookup tripId from existing item for auth
  const existing = await db.infoItem.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const item = await db.infoItem.delete({ where: { id } });
  emitWS("info:updated", item.tripId, {});
  return NextResponse.json({ ok: true });
}
