import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { rateLimitMiddleware, userRateLimit } from "@/lib/rate-limit";
import { getPlanLimits } from "@/lib/app-config";
import { publish } from "@/lib/ws-bus";

// POST /api/trips/join?code=CHINA2024 — присоединиться к поездке по invite-коду
export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Invite code required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = user!.id;
  const { displayName, emoji, color } = body;

  // Найти поездку по invite-коду: как есть → верхний регистр → нижний
  // (иначе код из lower-case в БД не находится по UPPERCASE-варианту и наоборот)
  const trip = await db.trip.findUnique({
    where: { inviteCode: code },
    include: {
      members: { select: { userId: true, role: true } },
    },
  }) || await db.trip.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: {
      members: { select: { userId: true, role: true } },
    },
  }) || await db.trip.findUnique({
    where: { inviteCode: code.toLowerCase() },
    include: {
      members: { select: { userId: true, role: true } },
    },
  });

  if (!trip) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  // Забаненному в этой поездке вход закрыт (утёкшая ссылка и т.п.)
  const ban = await db.tripBan.findUnique({
    where: { tripId_userId: { tripId: trip.id, userId } },
  });
  if (ban) {
    return NextResponse.json(
      { error: "Вас заблокировали в этой поездке. Свяжись с владельцем или админом.", banned: true },
      { status: 403 }
    );
  }

  // Проверить не участник ли уже
  const existing = trip.members.find((m) => m.userId === userId);
  if (existing) {
    return NextResponse.json({ tripId: trip.id, alreadyMember: true });
  }

  // Проверить лимит участников по плану ВЛАДЕЛЬЦА поездки
  const owner = trip.members.find((m) => m.role === "owner");
  if (owner) {
    const ownerUser = await db.user.findUnique({ where: { id: owner.userId } });
    const isOwnerPremium = ownerUser?.plan === "premium" && (!ownerUser?.planExpiry || ownerUser.planExpiry > new Date());
    const { maxMembers: freeMaxMembers } = await getPlanLimits();
    const maxMembers = isOwnerPremium ? Infinity : freeMaxMembers;

    if (trip.members.length >= maxMembers) {
      return NextResponse.json({
        error: `Лимит участников (${maxMembers}) исчерпан. Владелец поездки может перейти на Premium.`,
        upgrade: true,
        current: trip.members.length,
        max: maxMembers === Infinity ? null : maxMembers,
      }, { status: 403 });
    }
  }

  // Добавить участника
  const member = await db.tripMember.create({
    data: {
      tripId: trip.id,
      userId,
      role: "member",
      displayName: displayName || "Новый участник",
      emoji: emoji || "👤",
      color: color || "#94a3b8",
    },
  });

  // Живая синхронизация состава: у остальных подтянутся участники и событие в ленте
  await publish(trip.id, "member:joined", { tripId: trip.id, displayName: member.displayName });

  return NextResponse.json({ tripId: trip.id, memberId: member.id });
}

// GET /api/trips/join?code=CHINA2024 — получить инфо о поездке по коду (для preview)
// Только для авторизованных + rate-limit: код инвайт-страницы перебирают боты
export async function GET(req: NextRequest) {
  const { response } = await requireUser(req);
  if (response) return response;

  const limited = rateLimitMiddleware(req, "join-get", 30, 60_000);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Invite code required" }, { status: 400 });
  }

  const trip = await db.trip.findUnique({
    where: { inviteCode: code },
    select: {
      id: true,
      title: true,
      destination: true,
      coverColor: true,
      coverEmoji: true,
      startDate: true,
      totalDays: true,
      members: {
        select: { displayName: true, emoji: true, color: true },
      },
    },
  }) || await db.trip.findUnique({
    where: { inviteCode: code.toUpperCase() },
    select: {
      id: true,
      title: true,
      destination: true,
      coverColor: true,
      coverEmoji: true,
      startDate: true,
      totalDays: true,
      members: {
        select: { displayName: true, emoji: true, color: true },
      },
    },
  }) || await db.trip.findUnique({
    where: { inviteCode: code.toLowerCase() },
    select: {
      id: true,
      title: true,
      destination: true,
      coverColor: true,
      coverEmoji: true,
      startDate: true,
      totalDays: true,
      members: {
        select: { displayName: true, emoji: true, color: true },
      },
    },
  });

  if (!trip) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  return NextResponse.json(trip);
}
