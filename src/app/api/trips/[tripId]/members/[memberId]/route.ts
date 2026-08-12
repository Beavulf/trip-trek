import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember } from "@/lib/api-auth";

// PATCH /api/trips/[tripId]/members/[memberId] — обновить бюджет участника
// memberId может быть как memberId так и userId (найдём по tripId+userId)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tripId: string; memberId: string }> }) {
  const { tripId, memberId } = await params;
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.budget === "number" || body.budget === null) data.budget = body.budget;
  if (typeof body.displayName === "string") data.displayName = body.displayName;
  if (typeof body.emoji === "string") data.emoji = body.emoji;
  if (typeof body.color === "string") data.color = body.color;

  // Сначала пытаемся найти по memberId, затем по userId
  let member = await db.tripMember.findUnique({ where: { id: memberId } }).catch(() => null);
  if (!member) {
    member = await db.tripMember.findUnique({ where: { tripId_userId: { tripId, userId: memberId } } });
  }
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const updated = await db.tripMember.update({ where: { id: member.id }, data });
  emitWS("trip:updated", tripId, {});
  return NextResponse.json(updated);
}
