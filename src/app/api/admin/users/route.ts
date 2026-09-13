import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";
import { notifyUser } from "@/lib/notify";
import { userRateLimit } from "@/lib/rate-limit";
import { changePassword, validatePasswordPolicy } from "@/lib/password";

// Никогда не отдаём password и служебные поля
const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  emoji: true,
  color: true,
  avatarUrl: true,
  plan: true,
  planExpiry: true,
  role: true,
  aiBlocked: true,
  aiApiKey: false,
  createdAt: true,
  _count: { select: { memberships: true } },
} as const;

// GET /api/admin/users?q= — список (поиск по имени/email)
// GET /api/admin/users?id= — карточка: профиль + поездки + вклад в контент
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (id) {
    const user = await db.user.findUnique({
      where: { id },
      select: {
        ...SAFE_SELECT,
        memberships: {
          select: {
            id: true,
            role: true,
            displayName: true,
            joinedAt: true,
            trip: {
              select: {
                id: true,
                title: true,
                status: true,
                coverEmoji: true,
                coverColor: true,
                _count: { select: { members: true, expenses: true } },
              },
            },
          },
          orderBy: { joinedAt: "desc" },
        },
        _count: { select: { memberships: true, photos: true, expenses: true, journals: true, feedback: true } },
      },
    });
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    return NextResponse.json(user);
  }

  const q = params.get("q")?.trim();
  const users = await db.user.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: SAFE_SELECT,
  });

  return NextResponse.json(users);
}

// PATCH /api/admin/users — тело { id, plan?, premiumDays?, role?, name?, email?, emoji?, color?, password? }
// premiumDays: число → premium на N дней; null/undefined → бессрочно
export async function PATCH(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-users", 60, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { id, plan, premiumDays, role, name, email, emoji, color, password, message, aiBlocked } = body as {
    id?: string;
    plan?: string;
    premiumDays?: number | null;
    role?: string;
    name?: string;
    email?: string;
    emoji?: string;
    color?: string;
    password?: string;
    message?: string;
    aiBlocked?: boolean;
  };
  // Пароль пишем отдельным changePassword (passwordChangedAt + сжигание ссылок сброса),
  // поэтому в общий data он не попадает
  let newPassword: string | undefined;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: {
    plan?: string;
    planExpiry?: Date | null;
    role?: string;
    name?: string;
    email?: string;
    emoji?: string;
    color?: string;
    aiBlocked?: boolean;
  } = {};

  if (plan !== undefined) {
    if (plan !== "free" && plan !== "premium") {
      return NextResponse.json({ error: "plan: free | premium" }, { status: 400 });
    }
    data.plan = plan;
    if (plan === "premium") {
      data.planExpiry =
        typeof premiumDays === "number" && premiumDays > 0
          ? new Date(Date.now() + premiumDays * 86_400_000)
          : null;
    } else {
      data.planExpiry = null;
    }
  }
  if (role !== undefined) {
    if (role !== "user" && role !== "admin") {
      return NextResponse.json({ error: "role: user | admin" }, { status: 400 });
    }
    // Свою роль не меняем: админ не может случайно снять себя
    if (id === admin!.id) {
      return NextResponse.json({ error: "Нельзя менять собственную роль" }, { status: 400 });
    }
    data.role = role;
  }
  if (aiBlocked !== undefined) {
    if (typeof aiBlocked !== "boolean") {
      return NextResponse.json({ error: "aiBlocked: boolean" }, { status: 400 });
    }
    if (id === admin!.id && aiBlocked) {
      return NextResponse.json({ error: "Нельзя блокировать ИИ самому себе" }, { status: 400 });
    }
    data.aiBlocked = aiBlocked;
  }
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 64) {
      return NextResponse.json({ error: "Имя: 1–64 символа" }, { status: 400 });
    }
    data.name = name.trim();
  }
  if (email !== undefined) {
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
    }
    data.email = email.trim().toLowerCase();
  }
  if (emoji !== undefined) {
    if (typeof emoji !== "string" || !emoji.trim() || emoji.length > 16) {
      return NextResponse.json({ error: "emoji: 1–16 символов" }, { status: 400 });
    }
    data.emoji = emoji.trim();
  }
  if (color !== undefined) {
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json({ error: "Цвет в формате #rrggbb" }, { status: 400 });
    }
    data.color = color.toLowerCase();
  }
  if (password !== undefined) {
    // Политика та же, что при регистрации; запись — через единый changePassword
    const policyError = validatePasswordPolicy(password);
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 });
    }
    newPassword = password;
  }

  // Сообщение от админа — не меняет профиль, только уведомление
  if (message !== undefined) {
    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: "Сообщение: до 2000 символов" }, { status: 400 });
    }
    if (Object.keys(data).length === 0 && !newPassword) {
      const target = await db.user.findUnique({ where: { id }, select: { name: true } });
      if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
      await notifyUser(id, {
        type: "admin_message",
        title: "Сообщение от админа TripTrek",
        body: message.trim(),
      });
      await logAdmin(admin!.id, "user.message", { type: "user", id, label: target.name });
      return NextResponse.json({ ok: true, sent: true });
    }
  }

  if (Object.keys(data).length === 0 && !newPassword) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  try {
    const before = await db.user.findUnique({ where: { id }, select: { name: true } });
    const updated = await db.user.update({ where: { id }, data, select: SAFE_SELECT });

    // Журнал + уведомление: каждое действие отдельно, с человеческой меткой
    const label = updated.name;
    if (data.plan) {
      const granted = data.plan === "premium";
      await logAdmin(admin!.id, "user.premium", { type: "user", id, label }, {
        plan: data.plan,
        days: granted ? (premiumDays ?? null) : 0,
      });
      await notifyUser(id, {
        type: "premium",
        title: granted
          ? premiumDays
            ? `Вам выдали Premium на ${premiumDays} дн 🎉`
            : "Вам выдали безлимитный Premium 🎉"
          : "Premium отключён админом",
        body: granted
          ? premiumDays
            ? `Активен до ${new Date(Date.now() + premiumDays! * 86_400_000).toLocaleDateString("ru-RU")}. Поездки и участники — без лимитов.`
            : "Без лимитов поездок и участников, навсегда."
          : "Лимиты free-плана вернулись. Если это ошибка — напиши админу.",
      });
    }
    if (data.role) {
      await logAdmin(admin!.id, "user.role", { type: "user", id, label }, { role: data.role });
    }
    if (data.aiBlocked !== undefined) {
      const blocked = data.aiBlocked;
      await logAdmin(admin!.id, blocked ? "user.ai_block" : "user.ai_unblock", { type: "user", id, label });
      await notifyUser(id, {
        type: blocked ? "ai_blocked" : "ai_unblocked",
        title: blocked ? "Доступ к ИИ ограничен админом" : "Доступ к ИИ восстановлен",
        body: blocked
          ? "ИИ-функции (рассказы, разговорник, шеф) отключены для твоего аккаунта. Если считаешь это ошибкой — напиши админу."
          : "ИИ-функции снова работают. Приятных путешествий!",
        url: "/profile",
      });
    }
    // Пароль — отдельной единой точкой записи: хеш, passwordChangedAt (выкидывает
    // другие сессии), сжигание ссылок сброса и уведомление пользователю внутри.
    if (newPassword) {
      await changePassword(id, newPassword);
      await logAdmin(admin!.id, "user.password", { type: "user", id, label });
    }
    const profileFields = [data.name, data.email, data.emoji, data.color].filter((v) => v !== undefined);
    if (profileFields.length > 0) {
      await logAdmin(admin!.id, "user.edit", { type: "user", id, label }, {
        fields: Object.keys(data).filter((k) => ["name", "email", "emoji", "color"].includes(k)),
        beforeName: before?.name,
      });
    }

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
      if (e.code === "P2002") return NextResponse.json({ error: "Этот email уже занят другим аккаунтом" }, { status: 409 });
    }
    console.error("[admin/users] PATCH failed:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}

// DELETE /api/admin/users?id= — удаление пользователя.
// Защита данных: юзер, плативший в общих тратах, не удаляется (Expense.paidById —
// обязательная связь). Юзер, участвовавший в сплитах, перед удалением вычищается
// из splitWith — иначе балансы поездок навсегда залипают на призрачном id.
export async function DELETE(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-users", 60, 60_000);
  if (limited) return limited;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === admin!.id) {
    return NextResponse.json({ error: "Нельзя удалить собственный аккаунт" }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id }, select: { name: true } });
  if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  const expenseCount = await db.expense.count({ where: { paidById: id } });
  if (expenseCount > 0) {
    return NextResponse.json(
      {
        error: `Удаление заблокировано: пользователь заплатил в ${expenseCount} ${expenseCount === 1 ? "трате" : "тратах"}. Сначала удали или перенеси его траты.`,
        expenseCount,
      },
      { status: 409 }
    );
  }

  try {
    await db.$transaction(async (tx) => {
      const splits = await tx.expense.findMany({
        where: { splitWith: { contains: id } },
        select: { id: true, splitWith: true },
      });
      for (const e of splits) {
        const rest = e.splitWith
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && s !== id)
          .join(",");
        await tx.expense.update({ where: { id: e.id }, data: { splitWith: rest } });
      }
      await tx.user.delete({ where: { id } });
    });
    await logAdmin(admin!.id, "user.delete", { type: "user", id, label: target.name }, { expenseCount: 0 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }
    console.error("[admin/users] DELETE failed:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
