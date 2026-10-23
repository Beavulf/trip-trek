import { describe, it, expect } from "vitest";
import { availableMonths, monthStats, type StatsExpense } from "./stats";

const e = (over: Partial<StatsExpense>): StatsExpense => ({
  amountCents: 1000,
  category: "groceries",
  paidById: "a",
  spentOn: "2026-10-05",
  shares: [
    { memberId: "a", cents: 500 },
    { memberId: "b", cents: 500 },
  ],
  ...over,
});

describe("monthStats", () => {
  const data = [
    e({}),
    e({ amountCents: 3000, category: "rent", paidById: "b", spentOn: "2026-10-01", shares: [{ memberId: "a", cents: 1500 }, { memberId: "b", cents: 1500 }] }),
    e({ amountCents: 2000, spentOn: "2026-09-20" }),
    e({ amountCents: 700, category: "unknown-old", spentOn: "2026-10-05", shares: [{ memberId: "b", cents: 700 }] }),
  ];

  it("итог месяца, прошлый месяц и число трат", () => {
    const s = monthStats(data, "2026-10", "a");
    expect(s.totalCents).toBe(4700);
    expect(s.prevTotalCents).toBe(2000);
    expect(s.count).toBe(3);
  });

  it("категории по убыванию, неизвестная — в «Прочее»", () => {
    const s = monthStats(data, "2026-10");
    expect(s.byCategory).toEqual([
      { category: "rent", cents: 3000 },
      { category: "groceries", cents: 1000 },
      { category: "other", cents: 700 },
    ]);
  });

  it("кто платил и на кого пришлось (потребление)", () => {
    const s = monthStats(data, "2026-10");
    expect(s.byPayer).toEqual([
      { memberId: "b", cents: 3000 },
      { memberId: "a", cents: 1700 },
    ]);
    expect(s.byConsumer).toEqual([
      { memberId: "b", cents: 2700 },
      { memberId: "a", cents: 2000 },
    ]);
  });

  it("моя доля по категориям — потребление, а не вынутое из кошелька", () => {
    const s = monthStats(data, "2026-10", "a");
    expect(s.myTotalCents).toBe(2000);
    expect(s.myByCategory).toEqual([
      { category: "rent", cents: 1500 },
      { category: "groceries", cents: 500 },
    ]);
  });

  it("траты по дням отсортированы по дате", () => {
    expect(monthStats(data, "2026-10").byDay).toEqual([
      { date: "2026-10-01", cents: 3000 },
      { date: "2026-10-05", cents: 1700 },
    ]);
  });

  it("пустой месяц не падает", () => {
    const s = monthStats([], "2026-10", "a");
    expect(s).toMatchObject({ totalCents: 0, count: 0, byCategory: [], myTotalCents: 0 });
  });
});

describe("availableMonths", () => {
  it("месяцы с тратами и текущий, от новых к старым", () => {
    expect(availableMonths([{ spentOn: "2026-08-03" }, { spentOn: "2026-10-01" }, { spentOn: "2026-08-20" }], "2026-11")).toEqual([
      "2026-11",
      "2026-10",
      "2026-08",
    ]);
  });
});
