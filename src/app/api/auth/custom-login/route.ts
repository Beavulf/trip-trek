import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// POST /api/auth/custom-login — кастомный логин (обходит NextAuth v4 + Turbopack баг)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "email и пароль обязательны" }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    // Генерируем JWT токен (совместимый с NextAuth)
    const secret = process.env.NEXTAUTH_SECRET || "fallback-dev-secret";
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        emoji: user.emoji,
        color: user.color,
        plan: user.plan,
      },
      secret,
      { expiresIn: "30d" }
    );

    // Устанавливаем cookie (NextAuth использует next-auth.session-token)
    const response = NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      emoji: user.emoji,
      color: user.color,
      plan: user.plan,
    });
    response.cookies.set("next-auth.session-token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch (e) {
    console.error("Custom login error:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
