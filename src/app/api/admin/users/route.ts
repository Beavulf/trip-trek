import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { userRateLimit } from "@/lib/rate-limit";

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
  createdAt: true,
  _count: { select: { memberships: true } },
} as const;

// GET /api/admin/users?q= — список пользователей (поиск по имени/email)
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const q = new URL(req.url).searchParams.get("q")?.trim();
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

// PATCH /api/admin/users — тело { id, plan?, premiumDays?, role? }
// premiumDays: число → premium на N дней; null/undefined → бессрочно
export async function PATCH(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-users", 60, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { id, plan, premiumDays, role } = body as {
    id?: string;
    plan?: string;
    premiumDays?: number | null;
    role?: string;
  };

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: { plan?: string; planExpiry?: Date | null; role?: string } = {};
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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  try {
    const updated = await db.user.update({ where: { id }, data, select: SAFE_SELECT });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
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
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }
    console.error("[admin/users] DELETE failed:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
