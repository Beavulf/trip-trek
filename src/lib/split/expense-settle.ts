// «Оплачено» по конкретной трате. Перевод можно привязать к трате (SplitPayment.expenseId): «за интернет я перевёл».
// На балансе пары это обычный перевод — долги считает balances.ts. Здесь только отметка «доля в этой трате закрыта»:
// сколько из доли участника уже возвращено переводами, привязанными к ЭТОЙ трате, и сколько осталось.
// Перевод без привязки долю не закрывает (он снижает общий долг пары, но к какой трате относится — неизвестно).

import { formatCents } from "./money";

export interface PaymentLink {
  expenseId: string | null;
  fromId: string;
  toId: string;
  amountCents: number;
}

export interface ExpenseCore {
  id: string;
  paidById: string;
  shares: { memberId: string; cents: number }[];
}

export interface ShareSettlement {
  memberId: string;
  shareCents: number;
  paidCents: number;
  /** Сколько ещё должен плательщику по этой трате (не меньше нуля: переплата — отдельный встречный долг пары) */
  remainingCents: number;
}

/** Переводы по тратам: expenseId → переводы за неё. Строится один раз на список, а не на каждую строку. */
export function paymentsByExpense<T extends PaymentLink>(payments: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const p of payments) {
    if (!p.expenseId) continue;
    const list = map.get(p.expenseId);
    if (list) list.push(p);
    else map.set(p.expenseId, [p]);
  }
  return map;
}

/** Доли тех, кто должен плательщику (сам плательщик себе не должен), с учётом переводов за эту трату. */
export function expenseSettlement(expense: ExpenseCore, linked: PaymentLink[] | undefined): ShareSettlement[] {
  return expense.shares
    .filter((s) => s.memberId !== expense.paidById && s.cents > 0)
    .map((s) => {
      const paid = (linked ?? [])
        .filter((p) => p.fromId === s.memberId && p.toId === expense.paidById)
        .reduce((a, p) => a + p.amountCents, 0);
      return { memberId: s.memberId, shareCents: s.cents, paidCents: paid, remainingCents: Math.max(0, s.cents - paid) };
    });
}

export type MyExpenseState =
  /** Платил другой, у меня доля */
  | { kind: "owe"; shareCents: number; paidCents: number; remainingCents: number }
  /** Платил я: мне должны остальные */
  | { kind: "lent"; totalCents: number; remainingCents: number }
  /** Я не должен и мне не должны (личная трата или меня в ней нет) */
  | { kind: "none" };

export interface NettedShareMark {
  title: string;
  body: string;
  confirm: string;
}

/**
 * Предупреждение для отметки перевода по доле, чей долг перекрыт нетто-балансом пары.
 * Если встречные траты свели нетто пары против направления доли (или в ноль), долг по доле
 * уже «учтён» — отметка не закрывает его, а записывает ещё один перевод живыми деньгами,
 * и общий баланс откатывается назад. Читается как «подтвердить закрытие», поэтому кнопку
 * переименовываем и предупреждаем конкретными числами «до → после».
 */
export function nettedShareMark(args: {
  /** Плательщик траты — тот, кто смотрит */
  payerIsViewer: boolean;
  /** Дольщик — тот, кто смотрит */
  sharerIsViewer: boolean;
  shareCents: number;
  /** Нетто пары в направлении доли: плюс — дольщик должен плательщику */
  netCents: number;
  currency: string;
}): NettedShareMark {
  const viewerRel = args.payerIsViewer ? args.netCents : -args.netCents;
  const after = viewerRel + (args.sharerIsViewer ? args.shareCents : -args.shareCents);
  const pos = (rel: number) =>
    rel > 0 ? `тебе должны ${formatCents(rel, args.currency)}` : rel < 0 ? `ты должен(на) ${formatCents(-rel, args.currency)}` : "в расчёте";
  return {
    title: "Это отметка отдельного перевода",
    body:
      `Долг по этой доле уже учтён в общем балансе (${pos(viewerRel)}). ` +
      `Отметка запишет перевод на ${formatCents(args.shareCents, args.currency)} живыми деньгами, и баланс станет: ${pos(after)}. ` +
      "Отмечай, только если деньги переданы по-настоящему.",
    confirm: "Всё равно отметить",
  };
}

export function myExpenseState(expense: ExpenseCore, linked: PaymentLink[] | undefined, myId: string): MyExpenseState {
  const rows = expenseSettlement(expense, linked);
  if (expense.paidById === myId) {
    if (rows.length === 0) return { kind: "none" };
    return {
      kind: "lent",
      totalCents: rows.reduce((a, r) => a + r.shareCents, 0),
      remainingCents: rows.reduce((a, r) => a + r.remainingCents, 0),
    };
  }
  const mine = rows.find((r) => r.memberId === myId);
  return mine ? { kind: "owe", shareCents: mine.shareCents, paidCents: mine.paidCents, remainingCents: mine.remainingCents } : { kind: "none" };
}
