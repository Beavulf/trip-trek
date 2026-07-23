import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/info
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const items = await db.infoItem.findMany({
    where: type ? { type } : undefined,
    orderBy: [{ type: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(items);
}

// POST — создать карточку
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, title, content, icon } = body;
  if (!type || !title || !content) {
    return NextResponse.json({ error: "type, title, content required" }, { status: 400 });
  }
  const order = await db.infoItem.count({ where: { type } });
  const item = await db.infoItem.create({
    data: { type, title, content, icon: icon || null, order },
  });
  return NextResponse.json(item);
}

// PATCH — обновить
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, title, content, icon, type } = body;
  const data: Record<string, unknown> = {};
  if (typeof title === "string") data.title = title;
  if (typeof content === "string") data.content = content;
  if (icon !== undefined) data.icon = icon;
  if (typeof type === "string") data.type = type;
  const item = await db.infoItem.update({ where: { id }, data });
  return NextResponse.json(item);
}

// DELETE
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.infoItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
