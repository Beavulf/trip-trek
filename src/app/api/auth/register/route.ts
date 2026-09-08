import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/rate-limit";

// POST /api/auth/register — регистрация
export async function POST(req: NextRequest) {
  try {
    // P0: rate limiting — 3 registrations per hour per IP
    const rateLimit = rateLimitMiddleware(req, "register", 3, 60 * 60_000);
    if (rateLimit) return rateLimit;

    const { email, password, name, tripId, inviteCode } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "email, password, name обязательны" }, { status: 400 });
    }

    // P0: password must be at least 8 chars with at least one letter and one digit
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Пароль минимум 8 символов" }, { status: 400 });
    }
    if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
      return NextResponse.json({ error: "Пароль должен содержать буквы и цифры" }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Этот email уже зарегистрирован" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: { name, email, password: hashedPassword },
    });

    // Если есть tripId или inviteCode — добавляем в поездку
    let trip: { id: string } | null = null;
    if (tripId) {
      trip = await db.trip.findUnique({ where: { id: tripId }, select: { id: true } });
    } else if (inviteCode) {
      trip = await db.trip.findUnique({ where: { inviteCode }, select: { id: true } });
    }

    if (trip) {
      // Проверяем не вступил ли уже
      const existingMember = await db.tripMember.findUnique({
        where: { tripId_userId: { tripId: trip.id, userId: user.id } },
      });
      if (!existingMember) {
        await db.tripMember.create({
          data: {
            tripId: trip.id,
            userId: user.id,
            role: "member",
            displayName: name,
            emoji: "👤",
            color: "#94a3b8",
          },
        });
      }
    }

    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
