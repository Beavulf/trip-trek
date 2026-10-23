// Журнал группы: структурированные записи, текст строит клиент (имена и суммы могут поменяться,
// а запись остаётся правдой о том, что произошло). Дифф правки — чистая функция, тесты рядом.

import type { SplitMode } from "./split";

export const ACTIVITY_TYPES = [
  "group.created",
  "group.updated",
  "expense.created",
  "expense.updated",
  "expense.deleted",
  "payment.created",
  "payment.deleted",
  "member.added",
  "member.joined",
  "member.claimed",
  "member.left",
  "member.removed",
  "member.renamed",
  "recurring.created",
  "recurring.updated",
  "recurring.deleted",
  "recurring.paused",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Срез траты для сравнения до/после правки. */
export interface ExpenseSnapshot {
  description: string;
  amountCents: number;
  /** «USD:50000» — исходная валюта и сумма, null — трата внесена в валюте группы */
  original?: string | null;
  category: string;
  paidById: string;
  spentOn: string;
  note: string | null;
  splitMode: SplitMode;
  shares: { memberId: string; cents: number; weight?: number | null }[];
}

export type ExpenseChangeField =
  | "description"
  | "amountCents"
  | "original"
  | "category"
  | "paidById"
  | "spentOn"
  | "note"
  | "split";

export interface ExpenseChange {
  field: ExpenseChangeField;
  from?: string | number | null;
  to?: string | number | null;
}

/**
 * Что человек настроил в делении: поровну — только круг людей (суммы выводятся из суммы траты, их сдвиг при
 * правке суммы — не «смена деления»); точные суммы — круг + суммы; доли/проценты — круг + веса.
 */
function splitKey(mode: SplitMode, shares: ExpenseSnapshot["shares"]): string {
  const part = (s: ExpenseSnapshot["shares"][number]) =>
    mode === "equal" ? s.memberId : `${s.memberId}:${mode === "exact" ? s.cents : (s.weight ?? 0)}`;
  return `${mode}|${shares.map(part).sort().join(",")}`;
}

/** Что изменилось в трате. Пустой массив — правка ничего не поменяла (журнал не засоряем). */
export function diffExpense(before: ExpenseSnapshot, after: ExpenseSnapshot): ExpenseChange[] {
  const changes: ExpenseChange[] = [];
  const simple: Exclude<ExpenseChangeField, "split" | "original">[] = [
    "amountCents",
    "description",
    "category",
    "paidById",
    "spentOn",
    "note",
  ];
  for (const field of simple) {
    if (before[field] !== after[field]) changes.push({ field, from: before[field], to: after[field] });
  }
  if ((before.original ?? null) !== (after.original ?? null)) {
    changes.push({ field: "original", from: before.original ?? null, to: after.original ?? null });
  }
  if (splitKey(before.splitMode, before.shares) !== splitKey(after.splitMode, after.shares)) {
    changes.push({ field: "split" });
  }
  return changes;
}
