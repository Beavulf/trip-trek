import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { getAppConfig } from "@/lib/app-config";
import { normalizeInviteCode } from "@/lib/invite-code";
import { isAvatarColor, isAvatarEmoji } from "@/lib/avatar-presets";
import { validatePasswordPolicy, hashPassword } from "@/lib/password";
import { sendMail } from "@/lib/mail/mailer";
import { welcomeEmail } from "@/lib/mail/templates";

// POST /api/auth/register — регистрация
export async function POST(req: NextRequest) {
  try {
    // Rate limiting — 20 регистраций в час на IP. Было 3, но трафик из TikTok идёт с мобильных
    // сетей, где один IP делят десятки людей (CGNAT): живые пользователи упирались бы в 429.
    // Реальный барьер беты — инвайт-код (при inviteRequired), лимит лишь режет перебор и спам
    const rateLimit = rateLimitMiddleware(req, "register", 20, 60 * 60_000);
    if (rateLimit) return rateLimit;

    // Админ может закрыть регистрацию новых аккаунтов из панели
    const { registrationEnabled, inviteRequired } = await getAppConfig();
    if (!registrationEnabled) {
      return NextResponse.json(
        { error: "Регистрация новых аккаунтов временно закрыта. Вход для существующих — как обычно." },
        { status: 403 }
      );
    }

    const { email, password, name, inviteCode, emoji, color } = (await req.json().catch(() => null)) ?? {};

    if (!email || !password || !name) {
      return NextResponse.json({ error: "email, password, name обязательны" }, { status: 400 });
    }
    // Имя уходит в письма, уведомления и промпты ИИ: не-строка роняла Prisma 500-кой,
    // а мегабайтная строка раздувала бы каждый ответ с участниками
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
      return NextResponse.json({ error: "Имя: от 1 до 80 символов" }, { status: 400 });
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
    const displayName = name.trim();
    // Значок из формы регистрации: раньше терялся (сервер его не читал). Берём только значения из
    // фиксированных списков; всё остальное — дефолт схемы
    const avatar = {
      ...(isAvatarEmoji(emoji) ? { emoji } : {}),
      ...(isAvatarColor(color) ? { color } : {}),
    };

    // Слот инвайт-кода занимается атомарным условным updateMany: условие
    // перепроверяется в SQL, поэтому две регистрации на последнем слоте не
    // пройдут обе (count-then-create чужую незакоммиченную вставку не видит).
    // Транзакция нужна, чтобы провал create (например, дубликат email) не
    // оставил занятый слот без юзера.
    const INVITE_GONE = new Error("invite-gone");
    let user;
    if (inviteRequired) {
      const code = typeof inviteCode === "string" ? normalizeInviteCode(inviteCode) : "";
      if (!code) {
        return NextResponse.json({ error: "Введите инвайт-код" }, { status: 400 });
      }
      const codeRow = await db.inviteCode.findUnique({ where: { code } });
      if (!codeRow) {
        return NextResponse.json({ error: "Код недействителен или все места по нему заняты" }, { status: 400 });
      }
      try {
        user = await db.$transaction(async (tx) => {
          const taken = await tx.inviteCode.updateMany({
            where: {
              id: codeRow.id,
              deactivatedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              usedCount: { lt: codeRow.maxUses },
            },
            data: { usedCount: { increment: 1 } },
          });
          if (taken.count === 0) throw INVITE_GONE;
          return tx.user.create({
            data: { name: displayName, email: emailNorm, password: hashedPassword, inviteCodeId: codeRow.id, ...avatar },
          });
        });
      } catch (e) {
        if (e === INVITE_GONE) {
          return NextResponse.json({ error: "Код недействителен или все места по нему заняты" }, { status: 400 });
        }
        throw e;
      }
    } else {
      // Код не обязателен: переданное поле игнорируем, инвайт-привязку не пишем
      user = await db.user.create({
        data: { name: displayName, email: emailNorm, password: hashedPassword, ...avatar },
      });
    }

    // Приветственное письмо — fire-and-forget: SMTP не ждём, регистрацию не роняем.
    // Без SMTP_HOST mailer молча (с предупреждением в лог) пропустит отправку.
    void sendMail({ to: user.email, ...welcomeEmail(displayName) });

    // Вступление в поездку — ТОЛЬКО через POST /api/trips/join по invite-коду
    // (join page делает это после логина). Автоджойн здесь по tripId/inviteCode
    // удалён по аудиту 2026-09-12: путь обходил инвайт-код, проверку бана и
    // лимит участников владельца. Клиент поля и не передавал — код был мёртвым.

    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch (e) {
    // Детали (Prisma/SMTP и т.п.) наружу не отдаём — только в лог сервера
    console.error("[register] failed:", e);
    return NextResponse.json({ error: "Внутренняя ошибка регистрации. Попробуй позже." }, { status: 500 });
  }
}
