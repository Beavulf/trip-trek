import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { requireUser, getJwtSecret } from "@/lib/api-auth";
import { userRateLimit } from "@/lib/rate-limit";
import { changePassword, validatePasswordPolicy } from "@/lib/password";

// POST /api/user/password — смена пароля залогиненным пользователем.
// Текущее устройство остаётся в системе (перевыпускаем cookie с новым iat),
// все прочие сессии умирают через passwordChangedAt (см. custom-session).
export async function POST(req: NextRequest) {
  try {
    const { user: auth, response } = await requireUser(req);
    if (response) return response;

    const rateLimit = userRateLimit(req, auth!.id, "user-password", 10, 60 * 60_000);
    if (rateLimit) return rateLimit;

    const { currentPassword, newPassword } = await req.json().catch(() => ({}));

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 });
    }
    if (typeof currentPassword !== "string" || !currentPassword) {
      return NextResponse.json({ error: "Введите текущий пароль" }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: auth!.id }, select: { id: true, password: true } });
    if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
      return NextResponse.json({ error: "Текущий пароль неверен" }, { status: 400 });
    }

    await changePassword(user.id, newPassword);

    // Перевыпускаем cookie: свежий iat новее passwordChangedAt — текущая сессия живёт
    const fresh = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, emoji: true, color: true, plan: true },
    });
    const token = jwt.sign(fresh!, getJwtSecret(), { expiresIn: "30d" });
    const res = NextResponse.json({ ok: true });
    res.cookies.set("next-auth.session-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch (e) {
    console.error("[user/password] error:", e);
    return NextResponse.json({ error: "Не удалось изменить пароль. Попробуйте позже." }, { status: 500 });
  }
}
