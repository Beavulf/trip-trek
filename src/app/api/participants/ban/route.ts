import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireTripMember, requireUser } from "@/lib/api-auth";
import { notifyUser } from "@/lib/notify";
import { evictUserFromTrip } from "@/lib/ws-bus";
import { userRateLimit } from "@/lib/rate-limit";

// Бан пользователя в поездке силами ВЛАДЕЛЬЦА (например, утёкла ссылка-приглашение).
//   POST { tripId, userId, reason? } — забанить (и выгнать, если состоит)
//   DELETE ?tripId=&userId=          — разбанить
//   GET  ?tripId=                    — список забаненных
export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;
  const limited = userRateLimit(req, user!.id, "participants-ban", 30, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { tripId, userId, reason } = body as { tripId?: string; userId?: string; reason?: string };
  if (!tripId || !userId) return NextResponse.json({ error: "tripId и userId обязательны" }, { status: 400 });

  // Только владелец поездки может банить
  const callerMembership = await db.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: user!.id } },
  });
  if (!callerMembership || callerMembership.role !== "owner") {
    return NextResponse.json({ error: "Банить может только владелец поездки" }, { status: 403 });
  }
  if (userId === user!.id) {
    return NextResponse.json({ error: "Себя забанить нельзя" }, { status: 400 });
  }

  const [trip, target] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { title: true } }),
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);
  if (!trip || !target) return NextResponse.json({ error: "Поездка или пользователь не найдены" }, { status: 404 });

  try {
    await db.tripBan.create({
      data: { tripId, userId, reason: reason?.slice(0, 300) || null, createdBy: user!.id },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Этот пользователь уже заблокирован" }, { status: 409 });
    }
    throw e;
  }

  // Состоящего участника выгоняем
  const member = await db.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } });
  if (member) {
    await db.tripMember.delete({ where: { id: member.id } });
    void evictUserFromTrip(tripId, userId);
  }

  await notifyUser(userId, {
    type: "member_banned",
    title: `Вас заблокировали в поездке «${trip.title}»`,
    body: reason ? `Причина: ${reason}` : "Вступить снова по ссылке не получится — свяжись с организатором.",
  });

  return NextResponse.json({ ok: true, removedMember: Boolean(member) });
}

export async function GET(req: NextRequest) {
  const { response } = await requireUser(req);
  if (response) return response;

  const tripId = new URL(req.url).searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const { response: memberResp } = await requireTripMember(req, tripId);
  if (memberResp) return memberResp;

  const bans = await db.tripBan.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reason: true,
      createdAt: true,
      user: { select: { id: true, name: true, emoji: true, color: true, avatarUrl: true, email: true } },
    },
  });
  return NextResponse.json(bans);
}

export async function DELETE(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const params = new URL(req.url).searchParams;
  const tripId = params.get("tripId");
  const userId = params.get("userId");
  if (!tripId || !userId) return NextResponse.json({ error: "tripId и userId обязательны" }, { status: 400 });

  const callerMembership = await db.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: user!.id } },
  });
  if (!callerMembership || callerMembership.role !== "owner") {
    return NextResponse.json({ error: "Разбанивать может только владелец поездки" }, { status: 403 });
  }

  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { title: true } });
  const removed = await db.tripBan.deleteMany({ where: { tripId, userId } });
  if (removed.count > 0) {
    await notifyUser(userId, {
      type: "member_unbanned",
      title: `Вас разблокировали в поездке «${trip?.title || ""}»`,
      body: "Теперь можно присоединиться по ссылке-приглашению.",
    });
  }
  return NextResponse.json({ ok: true, unbanned: removed.count > 0 });
}
