import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "@/lib/api-auth";
import { rateLimitMiddleware } from "@/lib/rate-limit";

// POST /api/auth/custom-login — кастомный логин (обходит NextAuth v4 + Turbopack баг)
export async function POST(req: NextRequest) {
  try {
    // P0: rate limiting — 5 login attempts per 15 min per IP
    const rateLimit = rateLimitMiddleware(req, "login", 5, 15 * 60_000);
    if (rateLimit) return rateLimit;

    // login-CSRF: браузер всегда сопровождает POST заголовком Origin — разрешаем
    // только наш origin (NEXTAUTH_URL). text/plain-форму межсайтовая страница
    // отправить может, JSON с другим Content-Type — нет (нет preflight).
    // Если NEXTAUTH_URL не задан (голый dev без конфига) — проверку не применяем.
    const origin = req.headers.get("origin");
    const nextauthUrl = process.env.NEXTAUTH_URL;
    if (origin && nextauthUrl) {
      let allowedOrigin = "";
      try {
        allowedOrigin = new URL(nextauthUrl).origin;
      } catch {
        allowedOrigin = "";
      }
      if (allowedOrigin && origin !== allowedOrigin) {
        return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
      }
    }
    if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
      return NextResponse.json({ error: "Ожидался application/json" }, { status: 415 });
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "email и пароль обязательны" }, { status: 400 });
    }

    // Канонизация email: хранится и ищется в едином виде (аудит 2026-09-12 —
    // регистровая копия адреса не должна становиться вторым аккаунтом)
    const emailNorm = typeof email === "string" ? email.trim().toLowerCase() : "";

    const user = await db.user.findUnique({ where: { email: emailNorm } });
    if (!user || !user.password) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    // Генерируем JWT токен (совместимый с NextAuth)
    const secret = getJwtSecret();
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
      secure: process.env.NODE_ENV === "production",
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
