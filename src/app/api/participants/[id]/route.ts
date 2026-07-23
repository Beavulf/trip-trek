import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/participants/[id] — обновить участника (бюджет, имя, роль)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.budget === "number" || body.budget === null) data.budget = body.budget;
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.role === "string" || body.role === null) data.role = body.role;

  const participant = await db.participant.update({ where: { id }, data });
  return NextResponse.json(participant);
}
