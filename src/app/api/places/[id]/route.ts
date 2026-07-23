import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/places/[id] — обновить место (статус, заметки, рейтинг)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const allowed = ["status", "notes", "rating", "visitedAt", "timeOfDay"];
  const data: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) data[k] = body[k];
  }
  if (data.status === "visited" && !data.visitedAt) {
    data.visitedAt = new Date();
  }
  const place = await db.place.update({ where: { id }, data });
  return NextResponse.json(place);
}
