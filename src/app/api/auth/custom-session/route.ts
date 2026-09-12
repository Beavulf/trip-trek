import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { isPremiumUser } from "@/lib/premium";

// GET /api/auth/custom-session — кастомная сессия (читает наш JWT).
// Роль и план сверяются с БД: JWT живёт 30 дней, а premium/admin должны
// применяться (и сниматься) без пере-логина. Удалённый из БД пользователь
// получает user:null — то есть автоматический разлогин.
export async function GET(req: NextRequest) {
  const token = req.cookies.get("next-auth.session-token")?.value;

  if (!token) {
    return NextResponse.json({ user: null });
  }

  let decoded: { id: string; iat?: number };
  try {
    const secret = getJwtSecret();
    decoded = jwt.verify(token, secret) as { id: string; iat?: number };
  } catch {
    // Invalid token
    return NextResponse.json({ user: null });
  }

  if (!decoded?.id) return NextResponse.json({ user: null });

  try {
    const row = await db.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, email: true, emoji: true, color: true, avatarUrl: true, plan: true, planExpiry: true, role: true, passwordChangedAt: true },
    });

    if (!row) return NextResponse.json({ user: null });

    // Пароль сменён после выпуска токена — сессия недействительна. iat в JWT —
    // СЕКУНДЫ, passwordChangedAt — миллисекунды: сравниваем в секундах, иначе
    // токен, перевыпущенный в ту же секунду, что смена пароля, считается протухшим.
    if (row.passwordChangedAt && decoded.iat && decoded.iat < Math.floor(row.passwordChangedAt.getTime() / 1000)) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        emoji: row.emoji || "👤",
        color: row.color || "#94a3b8",
        avatarUrl: row.avatarUrl,
        plan: row.plan,
        planExpiry: row.planExpiry,
        isPremium: isPremiumUser(row),
        isAdmin: row.role === "admin",
      },
    });
  } catch (e) {
    // Сбой БД не должен выглядеть как разлогин: но клиент при не-2xx всё равно
    // покажет «не авторизован», так что отдаём тот же user:null без 500-шума
    console.error("[custom-session] DB lookup failed:", e);
    return NextResponse.json({ user: null });
  }
}
