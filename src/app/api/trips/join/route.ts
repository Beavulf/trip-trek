import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// POST /api/trips/join?code=CHINA2024 — присоединиться к поездке по invite-коду
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Invite code required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { userId, displayName, emoji, color } = body;

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // Найти поездку по invite-коду
  const trip = await db.trip.findUnique({
    where: { inviteCode: code.toUpperCase() },
  });

  if (!trip) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  // Проверить не участник ли уже
  const existing = await db.tripMember.findUnique({
    where: { tripId_userId: { tripId: trip.id, userId } },
  });

  if (existing) {
    return NextResponse.json({ tripId: trip.id, alreadyMember: true });
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

  return NextResponse.json({ tripId: trip.id, memberId: member.id });
}

// GET /api/trips/join?code=CHINA2024 — получить инфо о поездке по коду (для preview)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Invite code required" }, { status: 400 });
  }

  const trip = await db.trip.findUnique({
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
  });

  if (!trip) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  return NextResponse.json(trip);
}
