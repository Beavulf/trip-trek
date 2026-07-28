import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// POST /api/auth/register — регистрация
export async function POST(req: NextRequest) {
  try {
    const { email, password, name, tripId, inviteCode } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "email, password, name обязательны" }, { status: 400 });
    }

    if (password.length < 4) {
      return NextResponse.json({ error: "Пароль минимум 4 символа" }, { status: 400 });
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
    let trip = null;
    if (tripId) {
      trip = await db.trip.findUnique({ where: { id: tripId } });
    } else if (inviteCode) {
      trip = await db.trip.findUnique({ where: { inviteCode } });
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
