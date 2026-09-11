import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";
import { notifyUser } from "@/lib/notify";
import { userRateLimit } from "@/lib/rate-limit";

// Управление участниками конкретной поездки (админ).
//   GET    ?tripId=            — забаненные поездки (с профилями)
//   DELETE ?memberId=          — исключить участника (владельца нельзя — сначала передай владение)
//   POST   { tripId, userId, reason?, ban? } — забанить (и выгнать, если состоит)
//   DELETE ?banId=             — разбанить
// Все действия пишутся в AdminLog и уведомляют пострадавшего.

export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const tripId = new URL(req.url).searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const bans = await db.tripBan.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reason: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, emoji: true, color: true, avatarUrl: true } },
    },
  });
  return NextResponse.json(bans);
}

export async function POST(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-trip-members", 60, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { tripId, userId, reason, ban } = body as {
    tripId?: string;
    userId?: string;
    reason?: string;
    ban?: boolean;
  };
  if (!tripId || !userId) return NextResponse.json({ error: "tripId и userId обязательны" }, { status: 400 });

  const [trip, target] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { title: true } }),
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);
  if (!trip || !target) return NextResponse.json({ error: "Поездка или пользователь не найдены" }, { status: 404 });

  if (ban === false) {
    // разбан
    const removed = await db.tripBan.deleteMany({ where: { tripId, userId } });
    if (removed.count > 0) {
      await logAdmin(admin!.id, "trip.unban", { type: "trip", id: tripId, label: trip.title }, { userId, userName: target.name });
      await notifyUser(userId, {
        type: "member_unbanned",
        title: `Вас разблокировали в поездке «${trip.title}»`,
        body: "Теперь можно присоединиться по ссылке-приглашению.",
      });
    }
    return NextResponse.json({ ok: true, unbanned: removed.count > 0 });
  }

  // Бан ( ban === true / undefined )
  try {
    await db.tripBan.create({
      data: { tripId, userId, reason: reason?.slice(0, 300) || null, createdBy: admin!.id },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Этот пользователь уже заблокирован в поездке" }, { status: 409 });
    }
    throw e;
  }

  // Состоящего участника выгоняем
  const member = await db.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } });
  if (member) {
    if (member.role === "owner") {
      // владелец остаётся, но бан уже создан — убираем, чтобы не ломать поездку
      await db.tripBan.delete({ where: { tripId_userId: { tripId, userId } } });
      return NextResponse.json({ error: "Владельца нельзя заблокировать. Сначала передай владение другому участнику." }, { status: 400 });
    }
    await db.tripMember.delete({ where: { id: member.id } });
  }

  await logAdmin(admin!.id, "trip.ban", { type: "trip", id: tripId, label: trip.title }, { userId, userName: target.name, reason: reason || null });
  await notifyUser(userId, {
    type: "member_banned",
    title: `Вас заблокировали в поездке «${trip.title}»`,
    body: reason ? `Причина: ${reason}` : "Вступить снова по ссылке не получится — свяжись с админом.",
  });

  return NextResponse.json({ ok: true, removedMember: Boolean(member) });
}

export async function DELETE(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-trip-members", 60, 60_000);
  if (limited) return limited;

  const params = new URL(req.url).searchParams;

  // Разбан по id записи (для UI-списка забаненных)
  const banId = params.get("banId");
  if (banId) {
    const ban = await db.tripBan.findUnique({
      where: { id: banId },
      select: { tripId: true, userId: true, trip: { select: { title: true } }, user: { select: { name: true } } },
    });
    if (!ban) return NextResponse.json({ error: "Бан не найден" }, { status: 404 });
    await db.tripBan.delete({ where: { id: banId } });
    await logAdmin(admin!.id, "trip.unban", { type: "trip", id: ban.tripId, label: ban.trip.title }, { userId: ban.userId, userName: ban.user.name });
    await notifyUser(ban.userId, {
      type: "member_unbanned",
      title: `Вас разблокировали в поездке «${ban.trip.title}»`,
      body: "Теперь можно присоединиться по ссылке-приглашению.",
    });
    return NextResponse.json({ ok: true });
  }

  const memberId = params.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  const member = await db.tripMember.findUnique({
    where: { id: memberId },
    include: {
      trip: { select: { id: true, title: true } },
      user: { select: { id: true, name: true } },
    },
  });
  if (!member) return NextResponse.json({ error: "Участник не найден" }, { status: 404 });
  if (member.role === "owner") {
    return NextResponse.json(
      { error: "Владельца нельзя исключить из поездки — поездка потеряет хозяина. Сначала передай владение." },
      { status: 400 }
    );
  }

  await db.tripMember.delete({ where: { id: member.id } });
  await logAdmin(admin!.id, "trip.member_remove", { type: "trip", id: member.tripId, label: member.trip.title }, {
    userId: member.userId,
    userName: member.user.name,
  });
  await notifyUser(member.userId, {
    type: "member_removed",
    title: `Вас исключили из поездки «${member.trip.title}»`,
    body: "Если это ошибка — напиши админу через «Сообщить о проблеме».",
  });

  return NextResponse.json({ ok: true });
}
