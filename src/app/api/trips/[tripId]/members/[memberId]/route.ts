import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember } from "@/lib/api-auth";

// PATCH /api/trips/[tripId]/members/[memberId] — обновить бюджет участника
// memberId может быть как memberId так и userId (найдём по tripId+userId)
// P0: менять участника может только он сам или владелец поездки
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tripId: string; memberId: string }> }) {
  const { tripId, memberId } = await params;
  const { user, membership, response } = await requireTripMember(req, tripId);
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
  if (member.tripId !== tripId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (member.userId !== user!.id && membership!.role !== "owner") {
    return NextResponse.json({ error: "Можно менять только свой профиль участника" }, { status: 403 });
  }

  const updated = await db.tripMember.update({ where: { id: member.id }, data });
  publish(tripId, "trip:updated", {});
  return NextResponse.json(updated);
}
