import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userRateLimit } from "@/lib/rate-limit";
import { requireGroupMember } from "@/lib/split/access";
import { pairNet } from "@/lib/split/balances";
import { agoLabel, lastReminderAt, manualCooldownLeft, MIN_REMIND_CENTS } from "@/lib/split/reminders";
import { loadStampedLedger, sendDebtReminder } from "@/lib/split/reminders-server";
import { jsonError, readJson } from "@/lib/split/server";

type Ctx = { params: Promise<{ groupId: string }> };

// POST /api/split/groups/[groupId]/remind — { debtorId }: кредитор напоминает должнику о долге (ADR-0010).
// Напомнить можно только о РЕАЛЬНОМ текущем долге перед собой (считаем на сервере, клиенту не верим) и не чаще
// раза в 12 часов на пару. Должнику без аккаунта уведомление не уйдёт: `delivered: false`, клиент отдаёт текст.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;
  const limited = userRateLimit(req, user.id, "split-remind", 30, 60 * 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  const debtorId = typeof body?.debtorId === "string" ? body.debtorId : "";
  if (!debtorId || debtorId === member.id) return jsonError("Выбери, кому напомнить");

  const [group, debtor] = await Promise.all([
    db.splitGroup.findUnique({ where: { id: groupId }, select: { name: true, currency: true } }),
    db.splitMember.findFirst({ where: { id: debtorId, groupId }, select: { id: true, status: true, userId: true } }),
  ]);
  if (!group || !debtor) return jsonError("Участник не найден", 404);

  const { expenses, payments } = await loadStampedLedger(groupId);
  const owed = pairNet(expenses, payments, debtorId, member.id);
  if (owed < MIN_REMIND_CENTS) return jsonError("Этот человек сейчас вам ничего не должен", 409);

  const now = new Date();
  const recent = await db.splitReminder.findMany({
    where: { groupId, fromId: debtorId, toId: member.id },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { fromId: true, toId: true, createdAt: true },
  });
  const left = manualCooldownLeft(lastReminderAt(recent, debtorId, member.id), now);
  if (left > 0) {
    const hours = Math.ceil(left / 3_600_000);
    return jsonError(`Уже напоминали ${agoLabel(recent[0].createdAt, now)}. Можно снова через ${hours} ч`, 429);
  }

  // Без аккаунта (или вышел) уведомить некому — записи не создаём, кулдаун не тратим
  if (!debtor.userId || debtor.status !== "active") return NextResponse.json({ ok: true, delivered: false, cents: owed });

  const delivered = await sendDebtReminder({
    groupId,
    groupName: group.name,
    currency: group.currency,
    debtorMemberId: debtorId,
    creditorMemberId: member.id,
    cents: owed,
    kind: "manual",
  });
  return NextResponse.json({ ok: true, delivered, cents: owed });
}
