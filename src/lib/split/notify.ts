import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyUser } from "@/lib/notify";
import { evictUserFromRoom, publishRoom } from "@/lib/ws-bus";
import { formatCents } from "./money";

// Realtime и уведомления «Сочтёмся». Живое обновление экранов — событие `split:changed` в комнату группы
// (клиент инвалидирует кэш и показывает тост, если автор — не он). Пуши — персональные (текст зависит от
// получателя) и только тем, кого это касается: в повседневной группе общий «пуш всем на каждый чек» — спам.

export const groupRoom = (groupId: string) => `group:${groupId}`;

export interface SplitChange {
  kind:
    | "expense.created"
    | "expense.updated"
    | "expense.deleted"
    | "payment.created"
    | "payment.deleted"
    | "member.changed"
    | "group.updated"
    | "recurring.changed";
  /** User.id автора: его собственный клиент тост не показывает */
  actorUserId: string | null;
  actorName?: string;
  /** Для тоста «Лёша добавил «Пятёрочка» · 45 Br» */
  description?: string;
  amountCents?: number;
  currency?: string;
}

export function publishSplitChange(groupId: string, change: SplitChange): void {
  publishRoom(groupRoom(groupId), "split:changed", { groupId, ...change });
}

export function evictFromGroupRoom(groupId: string, userId: string): void {
  void evictUserFromRoom(groupRoom(groupId), userId);
}

export const groupUrl = (groupId: string, tab?: "balance" | "expenses" | "insights" | "more") =>
  `/split/${groupId}${tab ? `?tab=${tab}` : ""}`;

/** Новая трата: уведомляем плательщика и тех, на кого она делится (кроме автора). Пуш без записи в колокольчик. */
export async function notifyExpenseCreated(args: {
  groupId: string;
  groupName: string;
  currency: string;
  actorUserId: string;
  actorName: string;
  description: string;
  amountCents: number;
  paidById: string;
  shares: { memberId: string; cents: number }[];
}): Promise<void> {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return; // push не настроен — тихий пропуск
    const involved = new Set([args.paidById, ...args.shares.map((s) => s.memberId)]);
    const members = await db.splitMember.findMany({
      where: { id: { in: [...involved] }, status: "active", userId: { not: null } },
      select: { id: true, userId: true },
    });
    const targets = members.filter((m) => m.userId && m.userId !== args.actorUserId);
    if (targets.length === 0) return;
    const subs = await db.pushSubscription.findMany({ where: { userId: { in: targets.map((m) => m.userId!) } } });
    if (subs.length === 0) return;
    const { deliverPush, logPushFanout } = await import("@/lib/push-send");
    const outcomes: Awaited<ReturnType<typeof deliverPush>>[] = [];
    const dead: string[] = [];
    for (const m of targets) {
      const mine = subs.filter((s) => s.userId === m.userId);
      if (mine.length === 0) continue;
      const share = args.shares.find((s) => s.memberId === m.id)?.cents ?? 0;
      const body =
        `«${args.description}» · ${formatCents(args.amountCents, args.currency)}` +
        (share > 0 && m.id !== args.paidById ? ` — твоя доля ${formatCents(share, args.currency)}` : "");
      const payload = JSON.stringify({
        title: `${args.actorName} · ${args.groupName}`,
        body,
        tag: `split:${args.groupId}`,
        url: groupUrl(args.groupId),
      });
      const res = await Promise.all(mine.map((sub) => deliverPush(sub, payload)));
      outcomes.push(...res);
      res.forEach((o, i) => o === "gone" && dead.push(mine[i].endpoint));
    }
    if (dead.length) await db.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } });
    logPushFanout("split", outcomes, { groupId: args.groupId });
  } catch (e) {
    logger.error("split: expense push crashed", { groupId: args.groupId, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Перевод «отдал»: второй стороне — запись в колокольчик + пуш (важное событие, в отличие от каждой траты). */
export async function notifyPaymentRecorded(args: {
  groupId: string;
  groupName: string;
  currency: string;
  actorName: string;
  actorMemberId: string;
  fromId: string;
  toId: string;
  amountCents: number;
  /** Перевод за конкретную трату — называем её в уведомлении */
  forDescription?: string;
}): Promise<void> {
  try {
    const otherId = args.actorMemberId === args.fromId ? args.toId : args.fromId;
    const other = await db.splitMember.findUnique({ where: { id: otherId }, select: { userId: true, status: true } });
    if (!other?.userId || other.status !== "active") return;
    const sum = formatCents(args.amountCents, args.currency);
    const forWhat = args.forDescription ? ` за «${args.forDescription}»` : "";
    const title =
      args.actorMemberId === args.fromId
        ? `${args.actorName} отметил(а), что отдал(а) тебе ${sum}${forWhat}`
        : `${args.actorName} отметил(а), что получил(а) от тебя ${sum}${forWhat}`;
    await notifyUser(other.userId, {
      type: "split_payment",
      title,
      body: `Группа «${args.groupName}»`,
      url: groupUrl(args.groupId, "balance"),
    });
  } catch (e) {
    logger.error("split: payment notify crashed", { groupId: args.groupId, error: e instanceof Error ? e.message : String(e) });
  }
}
