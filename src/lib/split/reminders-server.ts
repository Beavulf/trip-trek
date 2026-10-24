import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyUser } from "@/lib/notify";
import { groupUrl } from "./notify";
import {
  dueAutoReminders,
  inAutoRemindWindow,
  MIN_REMIND_CENTS,
  reminderNotification,
  type PastReminder,
  type StampedExpense,
  type StampedPayment,
} from "./reminders";

// Серверная часть напоминаний о долгах (ADR-0010): отправка и часовой обход групп с включённым автонапоминанием.

/** Записать напоминание и уведомить должника (колокольчик + пуш). Вернёт false, если уведомить некому. */
export async function sendDebtReminder(args: {
  groupId: string;
  groupName: string;
  currency: string;
  debtorMemberId: string;
  creditorMemberId: string;
  cents: number;
  kind: "manual" | "auto";
}): Promise<boolean> {
  const [debtor, creditor] = await Promise.all([
    db.splitMember.findUnique({ where: { id: args.debtorMemberId }, select: { userId: true, status: true } }),
    db.splitMember.findUnique({ where: { id: args.creditorMemberId }, select: { displayName: true } }),
  ]);
  if (!debtor?.userId || debtor.status !== "active" || !creditor) return false;

  await db.splitReminder.create({
    data: { groupId: args.groupId, fromId: args.debtorMemberId, toId: args.creditorMemberId, amountCents: args.cents, kind: args.kind },
  });
  const text = reminderNotification({
    kind: args.kind,
    creditorName: creditor.displayName,
    groupName: args.groupName,
    cents: args.cents,
    currency: args.currency,
  });
  await notifyUser(debtor.userId, { type: "split_reminder", title: text.title, body: text.body, url: groupUrl(args.groupId, "balance") });
  return true;
}

/** Все траты и переводы группы с датой СОЗДАНИЯ записи — для правила «долг существует N дней». */
export async function loadStampedLedger(groupId: string): Promise<{ expenses: StampedExpense[]; payments: StampedPayment[] }> {
  const [expenses, payments] = await Promise.all([
    db.splitExpense.findMany({
      where: { groupId },
      select: { amountCents: true, paidById: true, createdAt: true, shares: { select: { memberId: true, cents: true } } },
    }),
    db.splitPayment.findMany({ where: { groupId }, select: { fromId: true, toId: true, amountCents: true, createdAt: true } }),
  ]);
  return { expenses, payments };
}

/** Один проход по группе: что пора напомнить, то и отправляем. Возвращает число отправленных. */
async function remindGroup(group: { id: string; name: string; currency: string; remindAfterDays: number }, now: Date): Promise<number> {
  const members = await db.splitMember.findMany({
    where: { groupId: group.id, status: "active", userId: { not: null } },
    select: { id: true },
  });
  const notifiable = new Set(members.map((m) => m.id));
  if (notifiable.size === 0) return 0;

  const since = new Date(now.getTime() - group.remindAfterDays * 86_400_000);
  const [{ expenses, payments }, reminders] = await Promise.all([
    loadStampedLedger(group.id),
    db.splitReminder.findMany({ where: { groupId: group.id, createdAt: { gt: since } }, select: { fromId: true, toId: true, createdAt: true } }),
  ]);
  const due = dueAutoReminders({
    expenses,
    payments,
    reminders: reminders as PastReminder[],
    afterDays: group.remindAfterDays,
    now,
    canNotify: (id) => notifiable.has(id),
  });
  let sent = 0;
  for (const d of due) {
    if (d.cents < MIN_REMIND_CENTS) continue;
    const ok = await sendDebtReminder({
      groupId: group.id,
      groupName: group.name,
      currency: group.currency,
      debtorMemberId: d.fromId,
      creditorMemberId: d.toId,
      cents: d.cents,
      kind: "auto",
    });
    if (ok) sent += 1;
  }
  return sent;
}

/** Обход всех групп с включённым автонапоминанием. Никогда не бросает: сбой одной группы не мешает остальным. */
export async function runSplitReminders(now = new Date()): Promise<number> {
  if (!inAutoRemindWindow(now)) return 0;
  let total = 0;
  try {
    const groups = await db.splitGroup.findMany({
      where: { remindAfterDays: { not: null } },
      select: { id: true, name: true, currency: true, remindAfterDays: true },
    });
    for (const g of groups) {
      try {
        total += await remindGroup({ ...g, remindAfterDays: g.remindAfterDays as number }, now);
      } catch (e) {
        logger.error("split: reminder run failed for group", { groupId: g.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (total > 0) logger.info("split: auto reminders sent", { count: total });
  } catch (e) {
    logger.error("split: reminder run crashed", { error: e instanceof Error ? e.message : String(e) });
  }
  return total;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Запуск часового таймера из server.ts. Первый тик — через 2 минуты после старта (контейнеру нужно прогреться),
 * дальше раз в час; `unref`, чтобы таймер не держал процесс при остановке. Один инстанс (ADR-0001).
 */
export function startSplitReminderJob(): void {
  const tick = () => void runSplitReminders();
  setTimeout(() => {
    tick();
    setInterval(tick, HOUR_MS).unref();
  }, 2 * 60 * 1000).unref();
}
