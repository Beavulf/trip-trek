import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "@/lib/api-auth";
import { getMaintenanceState } from "@/lib/maintenance-state";
import { rateLimitMiddleware, rateLimitBlocked, rateLimitRecord, rateLimitReset } from "@/lib/rate-limit";

// Хеш-пустышка: для несуществующего email всё равно гоняем bcrypt, иначе быстрый
// 401 выдаёт по времени ответа, что аккаунта нет (forgot-password этим же озабочен).
// Считаем один раз лениво — и async, чтобы не блокировать event loop: в этом процессе
// живут и HTTP, и WebSocket всех поездок.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash("triptrek-dummy-password", 10);
  return dummyHash;
}

// Два лимита. По IP — грубый потолок на ВСЕ попытки, включая успешные: 20 за 15 минут,
// чтобы друзья за общим Wi-Fi отеля или мобильным CGNAT входили без блокировок. По email —
// реальная защита от подбора: 8 НЕУДАЧ за 15 минут (успех сбрасывает счётчик). Цена
// за это: чужой человек, нарочно ошибаясь 8 раз, закроет вход жертве на 15 минут.
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_PER_IP = 20;
const LOGIN_MAX_FAILS_PER_EMAIL = 8;

// POST /api/auth/custom-login — кастомный логин (обходит NextAuth v4 + Turbopack баг)
export async function POST(req: NextRequest) {
  try {
    // P0: rate limiting по IP (см. константы выше); лимит по email — после разбора тела
    const rateLimit = rateLimitMiddleware(req, "login", LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS);
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

    const body = await req.json().catch(() => null);
    const { email, password } = body ?? {};

    if (!email || !password) {
      return NextResponse.json({ error: "email и пароль обязательны" }, { status: 400 });
    }
    // bcrypt берёт только первые 72 байта, но не-строка или мегабайтный «пароль» — мусор
    if (typeof email !== "string" || typeof password !== "string" || password.length > 1024) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    // Канонизация email: хранится и ищется в едином виде (аудит 2026-09-12 —
    // регистровая копия адреса не должна становиться вторым аккаунтом)
    const emailNorm = email.trim().toLowerCase();

    // Счётчик неудач ведём и по несуществующим адресам — иначе 429 выдавал бы, что аккаунт есть
    const failKey = `login-fail:${emailNorm}`;
    const locked = rateLimitBlocked(failKey, LOGIN_MAX_FAILS_PER_EMAIL, LOGIN_WINDOW_MS);
    if (locked) return locked;

    const user = await db.user.findUnique({ where: { email: emailNorm } });
    if (!user || !user.password) {
      await bcrypt.compare(password, await getDummyHash());
      rateLimitRecord(failKey, LOGIN_WINDOW_MS);
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      rateLimitRecord(failKey, LOGIN_WINDOW_MS);
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }
    rateLimitReset(failKey);

    // Техработы: пароль верный, но вход открыт только админу. Проверяем ПОСЛЕ пароля, чтобы по ответу
    // нельзя было узнать, чей email зарегистрирован; без cookie сессии — человек не «залипнет» в
    // залогиненном состоянии за заглушкой
    const maintenance = await getMaintenanceState();
    if (maintenance.on && user.role !== "admin") {
      return NextResponse.json(
        { error: maintenance.message, maintenance: true },
        { status: 503, headers: { "Retry-After": "30" } }
      );
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
