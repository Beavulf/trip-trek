import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";

// PATCH /api/participants/[id] — обновить участника (бюджет, имя, роль)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const existing = await db.tripMember.findUnique({
    where: { id },
    select: { tripId: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { membership, response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const data: Record<string, unknown> = {};
  if (typeof body.budget === "number" || body.budget === null) data.budget = body.budget;
  if (typeof body.name === "string") data.displayName = body.name;
  // роль меняет только owner
  if (typeof body.role === "string" || body.role === null) {
    if (membership!.role !== "owner") {
      return NextResponse.json({ error: "Only trip owner can change roles" }, { status: 403 });
    }
    data.role = body.role;
  }

  const member = await db.tripMember.update({ where: { id }, data });
  return NextResponse.json(member);
}
