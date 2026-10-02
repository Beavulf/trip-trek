import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { rateLimitMiddleware, userRateLimit } from "@/lib/rate-limit";
import { checkCanJoinTrip } from "@/lib/trip-join";
import { publish } from "@/lib/ws-bus";

// POST /api/trips/join?code=CHINA2024 — присоединиться к поездке по invite-коду
export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  // Лимит и по IP, и по юзеру: POST — боевой вход по коду (до 3 findUnique на
  // попытку), без лимита перебор кодов скриптом не ограничен ничем
  // (аудит 2026-10-02; в docs/api.md лимит был заявлен, но не стоял)
  const limited =
    rateLimitMiddleware(req, "join-post", 30, 60_000) ||
    userRateLimit(req, user!.id, "join-post-user", 30, 60_000);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code || code.length > 64) {
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

  // Бан, повторное членство и лимит владельца — общая логика с register
  // (аудит 2026-09-12: расхождение путей join и register и было дырой)
  const check = await checkCanJoinTrip(trip.id, userId);
  if (!check.ok) {
    return NextResponse.json(
      { error: check.error, ...(check.extra ?? {}) },
      { status: check.status }
    );
  }
  if (trip.members.some((m) => m.userId === userId)) {
    return NextResponse.json({ tripId: trip.id, alreadyMember: true });
  }

  // Добавить участника; капы полей — как в POST /api/trips, чтобы мусор из тела
  // не попадал в БД без границ
  const member = await db.tripMember.create({
    data: {
      tripId: trip.id,
      userId,
      role: "member",
      displayName:
        (typeof displayName === "string" ? displayName.trim().slice(0, 50) : "") || "Новый участник",
      emoji: typeof emoji === "string" && emoji ? emoji.slice(0, 16) : "👤",
      color: typeof color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#94a3b8",
    },
  });

  // Живая синхронизация состава: у остальных подтянутся участники и событие в ленте
  await publish(trip.id, "member:joined", { tripId: trip.id, displayName: member.displayName });

  return NextResponse.json({ tripId: trip.id, memberId: member.id });
}

// GET /api/trips/join?code=CHINA2024 — превью поездки по invite-коду.
// Доступно и без входа: друг должен видеть, куда его зовут, ДО регистрации —
// иначе страница приглашения для неавторизованных выглядела как «неверный код».
// Отдаём минимум (название, обложка, участники) + rate-limit по IP:
// код инвайт-страницы перебирают боты.
export async function GET(req: NextRequest) {
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
