// Чистая логика экрана «Бюджет»: шкала «потрачено против лимита», строки категорий, личные долги.
// Без React: одни и те же правила у шапки, строк категорий и бюджета каждого участника.

import type { Settlement } from "./balances";
import { fromCents, toCents } from "./money";

/** С этой доли лимита шкала предупреждает, что запас почти кончился */
const NEAR_LIMIT = 0.85;

export type MeterState =
  /** Лимит не задан: сравнивать не с чем */
  | "none"
  | "ok"
  | "near"
  | "over";

export interface BudgetMeterData {
  state: MeterState;
  /** Сколько осталось; при перерасходе отрицательно */
  remaining: number;
  /** На сколько вышли за лимит; иначе 0 */
  overBy: number;
  /** Сколько процентов лимита потрачено, целое */
  percent: number;
  /** Ширина заливки, % шкалы */
  fillPct: number;
  /**
   * Где на шкале стоит лимит, %. Пока лимит не превышен, он на правом краю. При перерасходе шкала
   * тянется до потраченного, и лимит уезжает влево: остаток шкалы справа и есть перерасход.
   * Обычная полоса упирается в 100% и не отличает +1% от +50%.
   */
  limitPct: number;
}

export function budgetMeter(spent: number, limit: number | null | undefined): BudgetMeterData {
  const spentC = toCents(Math.max(0, spent));
  const limitC = limit && limit > 0 ? toCents(limit) : 0;

  if (limitC === 0) {
    return { state: "none", remaining: 0, overBy: 0, percent: 0, fillPct: 0, limitPct: 100 };
  }

  const ratio = spentC / limitC;
  const remainingC = limitC - spentC;
  if (spentC > limitC) {
    return {
      state: "over",
      remaining: fromCents(remainingC),
      overBy: fromCents(-remainingC),
      percent: Math.round(ratio * 100),
      fillPct: 100,
      limitPct: (limitC / spentC) * 100,
    };
  }
  return {
    state: ratio >= NEAR_LIMIT ? "near" : "ok",
    remaining: fromCents(remainingC),
    overBy: 0,
    percent: Math.round(ratio * 100),
    fillPct: ratio * 100,
    limitPct: 100,
  };
}

export interface CategoryPlanRow {
  key: string;
  spent: number;
  /** Ручная часть плана */
  manual: number;
  /** Часть плана из бюджетов мест маршрута: считается сама, руками не правится */
  fromRoute: number;
  /** Часть плана из цены проживаний: тоже считается сама */
  fromLodging: number;
  plan: number;
  /** Доля категории в тратах, целый % */
  sharePct: number;
}

/**
 * Строки категорий: только те, где есть план или траты, самые затратные сверху.
 * Порядок по сумме, а не по справочнику: глаз сразу идёт туда, куда ушли деньги.
 */
export function buildCategoryRows(
  categories: string[],
  spentBy: Record<string, number>,
  manualBy: Record<string, number>,
  routeBy: Record<string, number>,
  lodgingBy: Record<string, number> = {}
): CategoryPlanRow[] {
  const totalSpent = categories.reduce((s, c) => s + (spentBy[c] ?? 0), 0);
  return categories
    .map((key) => {
      const spent = spentBy[key] ?? 0;
      const manual = manualBy[key] ?? 0;
      const fromRoute = routeBy[key] ?? 0;
      const fromLodging = lodgingBy[key] ?? 0;
      return {
        key,
        spent,
        manual,
        fromRoute,
        fromLodging,
        plan: manual + fromRoute + fromLodging,
        sharePct: totalSpent > 0 ? Math.round((spent / totalSpent) * 100) : 0,
      };
    })
    .filter((r) => r.plan > 0 || r.spent > 0)
    .sort((a, b) => b.spent - a.spent || b.plan - a.plan);
}

/** Личная позиция в долгах: сумма в центах, чтобы хвосты float не дали «должен $0.00» */
export function myDebts(settlements: Settlement[], userId: string): { iOwe: number; owedToMe: number } {
  let oweC = 0;
  let owedC = 0;
  for (const s of settlements) {
    if (s.from.id === userId) oweC += toCents(s.amount);
    if (s.to.id === userId) owedC += toCents(s.amount);
  }
  return { iOwe: fromCents(oweC), owedToMe: fromCents(owedC) };
}
