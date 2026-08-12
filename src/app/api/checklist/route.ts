import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember } from "@/lib/api-auth";

// GET /api/checklist?tripId=...
// P0 #1: tripId required (was leak when empty); P0 #2: auth + membership
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const items = await db.checklistItem.findMany({
    where: { tripId },
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, category, tripId } = body;
  const tripIdForAuth = tripId || new URL(req.url).searchParams.get("tripId");
  const { response } = await requireTripMember(req, tripIdForAuth);
  if (response) return response;
  if (!text || !tripId) return NextResponse.json({ error: "text, tripId required" }, { status: 400 });
  const order = await db.checklistItem.count({ where: { tripId, category: category || "preparation" } });
  const item = await db.checklistItem.create({ data: { text, category: category || "preparation", tripId, order } });
  emitWS("checklist:updated", tripId, {});
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, done, text, category } = body;

  // Lookup tripId from existing item for auth
  const existing = await db.checklistItem.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const data: Record<string, unknown> = {};
  if (typeof done === "boolean") data.done = done;
  if (typeof text === "string") data.text = text;
  if (typeof category === "string") data.category = category;
  const item = await db.checklistItem.update({ where: { id }, data });
  emitWS("checklist:updated", item.tripId, { itemId: id, done });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Lookup tripId from existing item for auth
  const existing = await db.checklistItem.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const item = await db.checklistItem.delete({ where: { id } });
  emitWS("checklist:updated", item.tripId, {});
  return NextResponse.json({ ok: true });
}
