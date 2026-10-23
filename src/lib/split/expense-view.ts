import { dayLabel } from "./dates";
import { categoryOf } from "./categories";
import type { SplitExpenseDTO } from "./types";

// Представление списка трат: «моя часть» в каждой строке, группы по дням, поиск и фильтры.
// Чистые функции (тесты рядом) — вкладка «Траты» только рисует то, что они вернули.

export type Stake =
  | { kind: "lent"; cents: number } // я платил за других — мне должны
  | { kind: "borrowed"; cents: number } // платил другой — я должен свою долю
  | { kind: "self"; cents: number } // платил я и только за себя — долгов нет
  | { kind: "none"; cents: 0 }; // меня в трате нет

/** Что эта трата значит лично для меня — главная подпись под суммой в строке. */
export function myStake(e: Pick<SplitExpenseDTO, "paidById" | "amountCents" | "shares">, myId: string): Stake {
  const mine = e.shares.find((s) => s.memberId === myId)?.cents ?? 0;
  if (e.paidById === myId) {
    const lent = e.amountCents - mine;
    return lent > 0 ? { kind: "lent", cents: lent } : { kind: "self", cents: mine };
  }
  return mine > 0 ? { kind: "borrowed", cents: mine } : { kind: "none", cents: 0 };
}

export interface ExpenseDayGroup {
  key: string;
  label: string;
  totalCents: number;
  items: SplitExpenseDTO[];
}

/** Группы по дню траты (spentOn). Вход уже отсортирован сервером/клиентом: порядок групп и строк сохраняется. */
export function groupExpensesByDay(expenses: SplitExpenseDTO[], todayKey: string): ExpenseDayGroup[] {
  const groups = new Map<string, ExpenseDayGroup>();
  for (const e of expenses) {
    let g = groups.get(e.spentOn);
    if (!g) {
      g = { key: e.spentOn, label: dayLabel(e.spentOn, todayKey), totalCents: 0, items: [] };
      groups.set(e.spentOn, g);
    }
    g.items.push(e);
    g.totalCents += e.amountCents;
  }
  return [...groups.values()];
}

export type ExpenseScope = "all" | "involved" | "paid";

export interface ExpenseFilter {
  query: string;
  scope: ExpenseScope;
  category: string | null;
}

export const NO_FILTER: ExpenseFilter = { query: "", scope: "all", category: null };

export const isFiltering = (f: ExpenseFilter) => f.query.trim() !== "" || f.scope !== "all" || f.category !== null;

export function filterExpenses(expenses: SplitExpenseDTO[], f: ExpenseFilter, myId: string): SplitExpenseDTO[] {
  const q = f.query.trim().toLowerCase();
  return expenses.filter((e) => {
    if (f.category && categoryOf(e.category) !== f.category) return false;
    if (f.scope === "paid" && e.paidById !== myId) return false;
    if (f.scope === "involved" && e.paidById !== myId && !e.shares.some((s) => s.memberId === myId)) return false;
    if (q && !`${e.description} ${e.note ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
