import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { changePassword, validatePasswordPolicy } from "@/lib/password";
import { createHash } from "crypto";

// POST /api/auth/reset-password — установка нового пароля по ссылке из письма.
// Токен одноразовый: валиден = удаляем строку тем же запросом (атомарно против гонки),
// не валиден/просрочен/уже использован — один и тот же нейтральный ответ.

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const rateLimit = rateLimitMiddleware(req, "reset-password", 20, 60 * 60_000);
    if (rateLimit) return rateLimit;

    const { token, password } = await req.json().catch(() => ({}));

    const policyError = validatePasswordPolicy(password);
    if (typeof token !== "string" || !token) {
      return NextResponse.json({ error: "Ссылка недействительна" }, { status: 400 });
    }
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const row = await db.passwordResetToken.findUnique({ where: { tokenHash }, select: { userId: true } });
    if (!row) {
      return NextResponse.json({ error: "Ссылка недействительна или устарела. Запросите новую." }, { status: 400 });
    }

    // Одноразовость: удаление сработает ровно один раз, даже при параллельных запросах
    const burned = await db.passwordResetToken.deleteMany({
      where: { tokenHash, expiresAt: { gt: new Date() } },
    });
    if (burned.count === 0) {
      return NextResponse.json({ error: "Ссылка недействительна или устарела. Запросите новую." }, { status: 400 });
    }

    await changePassword(row.userId, password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[reset-password] error:", e);
    return NextResponse.json({ error: "Не удалось изменить пароль. Попробуйте позже." }, { status: 500 });
  }
}
