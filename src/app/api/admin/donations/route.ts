import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";
import {
  simulateDonation,
  checkDonationToken,
  getDonationAccessToken,
  getDonationClientStatus,
} from "@/lib/donations-server";

// Донаты из DonationAlerts (ADR-0011) — вкладка «Донаты» админки.
// Список/итоги/статус клиента, ручная привязка к юзеру, тестовый донат и удаление.
// Чтение списка — только админ: суммы и сообщения донатов третьим лицам не показываем.

const LIST_SELECT = {
  id: true,
  source: true,
  donaterName: true,
  daUsername: true,
  message: true,
  amountCents: true,
  currency: true,
  donatedAt: true,
  matchedUserId: true,
  matchedBy: true,
  user: { select: { id: true, name: true, emoji: true, color: true, avatarUrl: true } },
} as const;

// GET — лента (200 последних), итоги по валютам и статус WS-клиента
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const [donations, totals, unmatched] = await Promise.all([
    db.donation.findMany({
      orderBy: { donatedAt: "desc" },
      take: 200,
      select: LIST_SELECT,
    }),
    db.donation.groupBy({
      by: ["currency"],
      _count: { _all: true },
      _sum: { amountCents: true },
      orderBy: { _sum: { amountCents: "desc" } },
    }),
    db.donation.count({ where: { matchedUserId: null } }),
  ]);

  return NextResponse.json({
    donations,
    totals: totals.map((t) => ({
      currency: t.currency,
      count: t._count._all,
      amountCents: t._sum.amountCents ?? 0,
    })),
    unmatched,
    client: getDonationClientStatus(),
  });
}

// PATCH { id, userId: string | null } — привязать/отвязать донат от юзера
export async function PATCH(req: NextRequest) {
  const { user, response } = await requireAdmin(req);
  if (response) return response;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "Нужен id доната" }, { status: 400 });

  const donation = await db.donation.findUnique({ where: { id }, select: LIST_SELECT });
  if (!donation) return NextResponse.json({ error: "Донат не найден" }, { status: 404 });

  const userId = body?.userId === null ? null : typeof body?.userId === "string" && body.userId ? body.userId : undefined;
  if (userId === undefined) return NextResponse.json({ error: "Нужен userId или null" }, { status: 400 });

  if (userId) {
    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
    if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    await db.donation.update({ where: { id }, data: { matchedUserId: userId, matchedBy: "manual" } });
    await logAdmin(user!.id, "donation.link", { type: "donation", id, label: donation.donaterName ?? "Аноним" }, {
      toUser: target.name,
      amountCents: donation.amountCents,
      currency: donation.currency,
    });
  } else {
    await db.donation.update({ where: { id }, data: { matchedUserId: null, matchedBy: null } });
    await logAdmin(user!.id, "donation.unlink", { type: "donation", id, label: donation.donaterName ?? "Аноним" }, {
      fromUser: donation.user?.name ?? null,
    });
  }

  const updated = await db.donation.findUnique({ where: { id }, select: LIST_SELECT });
  return NextResponse.json(updated);
}

// POST { action: "test-connection", token? } — проверка токена (по умолчанию — сохранённого в настройках)
// POST { action: "simulate" } — тестовый донат через весь путь приёма (колокольчик, лента)
export async function POST(req: NextRequest) {
  const { user, response } = await requireAdmin(req);
  if (response) return response;

  const body = await req.json().catch(() => null);

  if (body?.action === "test-connection") {
    let token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      token = (await getDonationAccessToken()) ?? "";
    }
    if (!token) return NextResponse.json({ ok: false, error: "Токен не задан" });
    const result = await checkDonationToken(token);
    await logAdmin(user!.id, "settings.donations_test", { type: "settings" }, {
      ok: result.ok,
      account: result.ok ? result.account : result.error,
    });
    return NextResponse.json(result);
  }

  if (body?.action === "simulate") {
    const result = await simulateDonation();
    return NextResponse.json({ result });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}

// DELETE ?id= — удалить донат (ошибочные/тестовые записи)
export async function DELETE(req: NextRequest) {
  const { user, response } = await requireAdmin(req);
  if (response) return response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Нужен id" }, { status: 400 });

  const donation = await db.donation.findUnique({ where: { id }, select: LIST_SELECT });
  if (!donation) return NextResponse.json({ error: "Донат не найден" }, { status: 404 });

  await db.donation.delete({ where: { id } });
  await logAdmin(user!.id, "donation.delete", { type: "donation", id, label: donation.donaterName ?? "Аноним" }, {
    amountCents: donation.amountCents,
    currency: donation.currency,
  });
  return NextResponse.json({ ok: true });
}
