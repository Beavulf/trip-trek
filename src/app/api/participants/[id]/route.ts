import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { notifyUser } from "@/lib/notify";
import { publish, evictUserFromTrip } from "@/lib/ws-bus";
import { userRateLimit } from "@/lib/rate-limit";

// PATCH /api/participants/[id] — обновить участника (бюджет, имя, роль)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const existing = await db.tripMember.findUnique({
    where: { id },
    select: { tripId: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { user, membership, response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  // P0: бюджет/имя участника меняет только он сам или владелец поездки
  const target = await db.tripMember.findUnique({ where: { id }, select: { userId: true } });
  if (target && target.userId !== user!.id && membership!.role !== "owner") {
    return NextResponse.json({ error: "Можно менять только свой профиль участника" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.budget === "number" || body.budget === null) data.budget = body.budget;
  if (typeof body.name === "string") data.displayName = body.name;
  // роль меняет только owner
  if (typeof body.role === "string" || body.role === null) {
    if (membership!.role !== "owner") {
      return NextResponse.json({ error: "Only trip owner can change roles" }, { status: 403 });
    }
    if (body.role === "owner") {
      // Передача владения: прежний владелец становится участником
      await db.tripMember.updateMany({ where: { tripId: existing.tripId, role: "owner" }, data: { role: "member" } });
      data.role = "owner";
    } else {
      data.role = body.role;
    }
  }

  const member = await db.tripMember.update({ where: { id }, data });
  publish(existing.tripId, "trip:updated", {});
  return NextResponse.json(member);
}

// DELETE /api/participants/[id] — исключить участника (только владелец поездки).
// Владельца исключить нельзя — сначала передай роль другому участнику (PATCH role=owner).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // id — это memberId; клиент может передать ?tripId=, тогда сработает и userId
  const tripIdParam = new URL(req.url).searchParams.get("tripId");
  let existing = await db.tripMember.findUnique({ where: { id } }).catch(() => null);
  if (!existing && tripIdParam) {
    existing = await db.tripMember.findUnique({ where: { tripId_userId: { tripId: tripIdParam, userId: id } } });
  }
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { user, membership, response } = await requireTripMember(req, existing.tripId);
  if (response) return response;
  if (membership!.role !== "owner") {
    return NextResponse.json({ error: "Исключать участников может только владелец поездки" }, { status: 403 });
  }
  const limited = userRateLimit(req, user!.id, "participants-delete", 30, 60_000);
  if (limited) return limited;

  const member = await db.tripMember.findUnique({
    where: { id: existing.id },
    include: {
      trip: { select: { title: true } },
      user: { select: { id: true, name: true } },
    },
  });
  if (!member) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (member.role === "owner") {
    return NextResponse.json({ error: "Владельца нельзя исключить — сначала передай роль другому участнику" }, { status: 400 });
  }

  await db.tripMember.delete({ where: { id: member.id } });
  void evictUserFromTrip(existing.tripId, member.userId);
  publish(existing.tripId, "trip:updated", {});

  await notifyUser(member.userId, {
    type: "member_removed",
    title: `Вас исключили из поездки «${member.trip.title}»`,
    body: "Если это ошибка — свяжись с организатором поездки.",
  });

  return NextResponse.json({ ok: true });
}
