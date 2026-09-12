import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitMiddleware, limit } from "@/lib/rate-limit";
import { createHash, randomBytes } from "crypto";
import { sendMail, mailLink } from "@/lib/mail/mailer";
import { resetPasswordEmail } from "@/lib/mail/templates";

// POST /api/auth/forgot-password — запрос ссылки сброса пароля.
// Ответ всегда одинаковый, есть аккаунт или нет — не раскрываем адреса.
// Токен: 32 случайных байта; в БД лежит только sha256-хеш, сырой — лишь в письме.

const TOKEN_TTL_MS = 60 * 60_000; // ссылка живёт 60 минут

// Ленивая чистка просроченных токенов — раз в 5 минут при запросах сброса
// (крона в приложении нет; шаблон — rate-limit.ts). Таблица растёт только отсюда.
let lastCleanup = 0;
async function cleanupExpired(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60_000) return;
  lastCleanup = now;
  await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    // P0: лимит запросов писем — 5 в час с одного IP
    const rateLimit = rateLimitMiddleware(req, "forgot-password", 5, 60 * 60_000);
    if (rateLimit) return rateLimit;

    const { email } = await req.json().catch(() => ({}));
    if (typeof email !== "string" || !email.trim()) {
      return NextResponse.json({ error: "email обязателен" }, { status: 400 });
    }

    // Лимит на сам адрес (3/час) — чтобы россыпью IP-адресов не бомбить чужой ящик
    // письмами и не выталкивать живую ссылку жертвы. Проверяем ДО поиска аккаунта
    // и для несуществующих адресов тоже — иначе 429 раскрыл бы, кто зарегистрирован.
    const perEmail = limit(`forgot-password-email:${email.trim()}`, { max: 3, windowMs: 60 * 60_000 });
    if (!perEmail.ok) {
      return NextResponse.json(
        { error: "Слишком много запросов. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(perEmail.retryAfterSec) } }
      );
    }

    await cleanupExpired();

    // Ищем как в логине — без приведения регистра: email хранится как ввели при регистрации
    const user = await db.user.findUnique({ where: { email: email.trim() } });
    if (user) {
      // Один живой токен на пользователя: старые ссылки гасим
      await db.passwordResetToken.deleteMany({ where: { userId: user.id } });

      const raw = randomBytes(32).toString("hex");
      await db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      });

      // Fire-and-forget: SMTP-задержка не ждём — иначе время ответа выдавало бы,
      // существует аккаунт, и юзер ждал бы postfix десятки секунд
      void sendMail({
        to: user.email,
        ...resetPasswordEmail(user.name, mailLink(`/reset-password?token=${raw}`), TOKEN_TTL_MS / 60_000),
      });

      // В dev без почты отдаём ссылку в ответе — иначе флоу не протестировать.
      // В проде никогда: SMTP либо настроен, либо запрос просто ничего не присылает.
      if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
        return NextResponse.json({ ok: true, devLink: mailLink(`/reset-password?token=${raw}`) });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[forgot-password] error:", e);
    return NextResponse.json({ error: "Не удалось отправить письмо. Попробуйте позже." }, { status: 500 });
  }
}
