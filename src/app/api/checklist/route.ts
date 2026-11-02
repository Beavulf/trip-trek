import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember, requireTripEditor } from "@/lib/api-auth";

// GET /api/checklist?tripId=...
// P0 #1: tripId required (was leak when empty); P0 #2: auth + membership
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const items = await db.checklistItem.findMany({
    take: 1000,
    where: { tripId },
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(items);
}

const MAX_ITEMS_AT_ONCE = 100;
const MAX_TEXT = 500;

type NewItem = { text: string; category: string };

/** Вход POST: один пункт или пачка из шаблонов. null — вход негодный */
function pickNewItems(body: { text?: unknown; category?: unknown; items?: unknown }): NewItem[] | null {
  const raw = Array.isArray(body.items) ? body.items : [body];
  if (raw.length === 0 || raw.length > MAX_ITEMS_AT_ONCE) return null;
  const items: NewItem[] = [];
  for (const r of raw as { text?: unknown; category?: unknown }[]) {
    const text = typeof r?.text === "string" ? r.text.trim().slice(0, MAX_TEXT) : "";
    if (!text) return null;
    items.push({ text, category: (typeof r.category === "string" && r.category.slice(0, 50)) || "preparation" });
  }
  return items;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tripId } = body;
  const tripIdForAuth = tripId || new URL(req.url).searchParams.get("tripId");
  const { response } = await requireTripEditor(req, tripIdForAuth);
  if (response) return response;
  const items = tripId ? pickNewItems(body) : null;
  if (!items) return NextResponse.json({ error: "text, tripId required" }, { status: 400 });

  // Порядок внутри категории считаем один раз: пачка параллельных запросов получала одинаковый order
  const counts = await db.checklistItem.groupBy({ by: ["category"], where: { tripId }, _count: true });
  const next = new Map(counts.map((c) => [c.category, c._count]));
  const created = await db.$transaction(
    items.map((item) => {
      const order = next.get(item.category) ?? 0;
      next.set(item.category, order + 1);
      return db.checklistItem.create({ data: { ...item, order, tripId } });
    })
  );
  publish(tripId, "checklist:updated", {});
  return NextResponse.json(created.length === 1 ? created[0] : created);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, done, text, category } = body;

  // Lookup tripId from existing item for auth
  const existing = await db.checklistItem.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripEditor(req, existing.tripId);
  if (response) return response;

  const data: Record<string, unknown> = {};
  if (typeof done === "boolean") data.done = done;
  if (typeof text === "string") data.text = text.slice(0, 500);
  if (typeof category === "string") data.category = category.slice(0, 50);
  const item = await db.checklistItem.update({ where: { id }, data });
  publish(item.tripId, "checklist:updated", { itemId: id, done });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Lookup tripId from existing item for auth
  const existing = await db.checklistItem.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripEditor(req, existing.tripId);
  if (response) return response;

  const item = await db.checklistItem.delete({ where: { id } });
  publish(item.tripId, "checklist:updated", {});
  return NextResponse.json({ ok: true });
}
