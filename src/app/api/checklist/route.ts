import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/checklist
export async function GET() {
  const items = await db.checklistItem.findMany({ orderBy: [{ category: "asc" }, { order: "asc" }] });
  return NextResponse.json(items);
}

// POST — добавить пункт
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, category } = body;
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const order = await db.checklistItem.count({ where: { category: category || "preparation" } });
  const item = await db.checklistItem.create({ data: { text, category: category || "preparation", order } });
  return NextResponse.json(item);
}

// PATCH — отметить/снять
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, done } = body;
  const item = await db.checklistItem.update({ where: { id }, data: { done } });
  return NextResponse.json(item);
}

// DELETE
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.checklistItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
