import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/checklist?tripId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const items = await db.checklistItem.findMany({
    where: tripId ? { tripId } : undefined,
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, category, tripId } = body;
  if (!text || !tripId) return NextResponse.json({ error: "text, tripId required" }, { status: 400 });
  const order = await db.checklistItem.count({ where: { tripId, category: category || "preparation" } });
  const item = await db.checklistItem.create({ data: { text, category: category || "preparation", tripId, order } });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, done, text, category } = body;
  const data: Record<string, unknown> = {};
  if (typeof done === "boolean") data.done = done;
  if (typeof text === "string") data.text = text;
  if (typeof category === "string") data.category = category;
  const item = await db.checklistItem.update({ where: { id }, data });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.checklistItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
