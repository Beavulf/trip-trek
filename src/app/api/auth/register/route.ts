import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// POST /api/auth/register — регистрация участника
export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "email, password, name обязательны" }, { status: 400 });
    }

    if (password.length < 4) {
      return NextResponse.json({ error: "Пароль минимум 4 символа" }, { status: 400 });
    }

    // Проверяем не занят ли email
    const existing = await db.participant.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Этот email уже зарегистрирован" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const participant = await db.participant.create({
      data: {
        name,
        email,
        password: hashedPassword,
        // дефолтные значения
        color: "#94a3b8",
        emoji: "👤",
      },
    });

    return NextResponse.json({
      id: participant.id,
      name: participant.name,
      email: participant.email,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
