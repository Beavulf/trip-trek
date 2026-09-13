import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { getAppConfig } from "@/lib/app-config";
import { validatePasswordPolicy, hashPassword } from "@/lib/password";
import { sendMail } from "@/lib/mail/mailer";
import { welcomeEmail } from "@/lib/mail/templates";

// POST /api/auth/register — регистрация
export async function POST(req: NextRequest) {
  try {
    // P0: rate limiting — 3 registrations per hour per IP
    const rateLimit = rateLimitMiddleware(req, "register", 3, 60 * 60_000);
    if (rateLimit) return rateLimit;

    // Админ может закрыть регистрацию новых аккаунтов из панели
    const { registrationEnabled } = await getAppConfig();
    if (!registrationEnabled) {
      return NextResponse.json(
        { error: "Регистрация новых аккаунтов временно закрыта. Вход для существующих — как обычно." },
        { status: 403 }
      );
    }

    const { email, password, name } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "email, password, name обязательны" }, { status: 400 });
    }
    // Формат email: это же значение потом уходит адресатом в SMTP (письма сброса),
    // так что мусор/CRLF отсекаем на входе. Тот же regex, что в admin PATCH.
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
    }

    // P0: password must be at least 8 chars with at least one letter and one digit
    const policyError = validatePasswordPolicy(password);
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 });
    }

    // Канонизация email: хранится в едином виде, иначе регистровая копия адреса
    // становилась «вторым аккаунтом», недостижимым ни логином, ни восстановлением
    // (аудит 2026-09-12; логин и forgot-password ищут по тому же нормализованному виду)
    const emailNorm = email.trim().toLowerCase();

    const existing = await db.user.findUnique({ where: { email: emailNorm } });
    if (existing) {
      return NextResponse.json({ error: "Этот email уже зарегистрирован" }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const user = await db.user.create({
      data: { name, email: emailNorm, password: hashedPassword },
    });

    // Приветственное письмо — fire-and-forget: SMTP не ждём, регистрацию не роняем.
    // Без SMTP_HOST mailer молча (с предупреждением в лог) пропустит отправку.
    void sendMail({ to: user.email, ...welcomeEmail(name) });

    // Вступление в поездку — ТОЛЬКО через POST /api/trips/join по invite-коду
    // (join page делает это после логина). Автоджойн здесь по tripId/inviteCode
    // удалён по аудиту 2026-09-12: путь обходил инвайт-код, проверку бана и
    // лимит участников владельца. Клиент поля и не передавал — код был мёртвым.

    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
