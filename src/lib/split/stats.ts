import { addMonths, monthOf } from "./dates";
import { categoryOf } from "./categories";

// Итоги месяца для вкладки «Итоги». «Моя доля» — потребление (сколько из общей кассы пришлось на меня),
// а не «сколько вынул из кошелька»: за кого платил — это про долги, не про расходы (та же семантика,
// что у личной аналитики бюджета поездок).

export interface StatsExpense {
  amountCents: number;
  category: string;
  paidById: string;
  spentOn: string;
  shares: { memberId: string; cents: number }[];
}

export interface MonthStats {
  month: string;
  totalCents: number;
  prevTotalCents: number;
  count: number;
  byCategory: { category: string; cents: number }[];
  /** Сколько каждый заплатил из кармана */
  byPayer: { memberId: string; cents: number }[];
  /** Сколько на кого пришлось (потребление) */
  byConsumer: { memberId: string; cents: number }[];
  /** Мои доли по категориям (если задан myMemberId) */
  myByCategory: { category: string; cents: number }[];
  myTotalCents: number;
  /** Траты по дням месяца: key — ГГГГ-ММ-ДД, только дни с тратами */
  byDay: { date: string; cents: number }[];
}

const toSortedList = <K extends string>(map: Map<string, number>, keyName: K) =>
  [...map.entries()]
    .filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, cents]) => ({ [keyName]: key, cents }) as { [P in K]: string } & { cents: number });

export function monthStats(expenses: StatsExpense[], month: string, myMemberId?: string | null): MonthStats {
  const prev = addMonths(month, -1);
  const byCategory = new Map<string, number>();
  const byPayer = new Map<string, number>();
  const byConsumer = new Map<string, number>();
  const myByCategory = new Map<string, number>();
  const byDay = new Map<string, number>();
  let total = 0;
  let prevTotal = 0;
  let count = 0;
  let myTotal = 0;

  for (const e of expenses) {
    const m = monthOf(e.spentOn);
    if (m === prev) prevTotal += e.amountCents;
    if (m !== month) continue;
    const category = categoryOf(e.category);
    total += e.amountCents;
    count += 1;
    byCategory.set(category, (byCategory.get(category) ?? 0) + e.amountCents);
    byPayer.set(e.paidById, (byPayer.get(e.paidById) ?? 0) + e.amountCents);
    byDay.set(e.spentOn, (byDay.get(e.spentOn) ?? 0) + e.amountCents);
    for (const s of e.shares) {
      byConsumer.set(s.memberId, (byConsumer.get(s.memberId) ?? 0) + s.cents);
      if (myMemberId && s.memberId === myMemberId) {
        myByCategory.set(category, (myByCategory.get(category) ?? 0) + s.cents);
        myTotal += s.cents;
      }
    }
  }

  return {
    month,
    totalCents: total,
    prevTotalCents: prevTotal,
    count,
    byCategory: toSortedList(byCategory, "category"),
    byPayer: toSortedList(byPayer, "memberId"),
    byConsumer: toSortedList(byConsumer, "memberId"),
    myByCategory: toSortedList(myByCategory, "category"),
    myTotalCents: myTotal,
    byDay: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, cents]) => ({ date, cents })),
  };
}

/** Месяцы, в которые есть траты, + текущий, от новых к старым — для переключателя. */
export function availableMonths(expenses: Pick<StatsExpense, "spentOn">[], currentMonth: string): string[] {
  const set = new Set<string>([currentMonth]);
  for (const e of expenses) set.add(monthOf(e.spentOn));
  return [...set].sort().reverse();
}
