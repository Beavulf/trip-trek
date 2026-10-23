import { describe, it, expect } from "vitest";
import { filterExpenses, groupExpensesByDay, isFiltering, myStake, NO_FILTER } from "./expense-view";
import type { SplitExpenseDTO } from "./types";

const exp = (over: Partial<SplitExpenseDTO>): SplitExpenseDTO => ({
  id: "e",
  amountCents: 3000,
  originalAmountCents: null,
  originalCurrency: null,
  description: "Пятёрочка",
  category: "groceries",
  paidById: "a",
  spentOn: "2026-10-23",
  note: null,
  splitMode: "equal",
  shares: [
    { memberId: "a", cents: 1000, weight: null },
    { memberId: "b", cents: 1000, weight: null },
    { memberId: "c", cents: 1000, weight: null },
  ],
  createdById: "a",
  recurringId: null,
  createdAt: "2026-10-23T10:00:00.000Z",
  updatedAt: "2026-10-23T10:00:00.000Z",
  ...over,
});

describe("myStake", () => {
  it("платил я за троих: мне должны чужие две трети", () => {
    expect(myStake(exp({}), "a")).toEqual({ kind: "lent", cents: 2000 });
  });
  it("платил другой, я в доле: я должен свою часть", () => {
    expect(myStake(exp({}), "b")).toEqual({ kind: "borrowed", cents: 1000 });
  });
  it("платил я только за себя — долгов нет", () => {
    expect(myStake(exp({ shares: [{ memberId: "a", cents: 3000, weight: null }] }), "a")).toEqual({ kind: "self", cents: 3000 });
  });
  it("платил я только за других (себя в доле нет) — мне должны всё", () => {
    expect(myStake(exp({ shares: [{ memberId: "b", cents: 3000, weight: null }] }), "a")).toEqual({ kind: "lent", cents: 3000 });
  });
  it("меня в трате нет", () => {
    expect(myStake(exp({ paidById: "b", shares: [{ memberId: "c", cents: 3000, weight: null }] }), "a")).toEqual({ kind: "none", cents: 0 });
  });
});

describe("groupExpensesByDay", () => {
  it("группы с подписью и суммой дня, порядок сохранён", () => {
    const groups = groupExpensesByDay(
      [exp({ id: "1" }), exp({ id: "2", amountCents: 500 }), exp({ id: "3", spentOn: "2026-10-22" }), exp({ id: "4", spentOn: "2026-10-12" })],
      "2026-10-23"
    );
    expect(groups.map((g) => [g.label, g.totalCents, g.items.length])).toEqual([
      ["Сегодня", 3500, 2],
      ["Вчера", 3000, 1],
      ["12 октября", 3000, 1],
    ]);
  });
});

describe("filterExpenses", () => {
  const list = [
    exp({ id: "1", description: "Такси домой", category: "transport", paidById: "b", shares: [{ memberId: "a", cents: 3000, weight: null }] }),
    exp({ id: "2", description: "Пятёрочка", note: "молоко" }),
    exp({ id: "3", description: "Интернет", category: "internet", paidById: "c", shares: [{ memberId: "c", cents: 3000, weight: null }] }),
  ];
  const ids = (f: Partial<typeof NO_FILTER>) => filterExpenses(list, { ...NO_FILTER, ...f }, "a").map((e) => e.id);

  it("без фильтра — всё", () => expect(ids({})).toEqual(["1", "2", "3"]));
  it("поиск по описанию и заметке без учёта регистра", () => {
    expect(ids({ query: "ТАКСИ" })).toEqual(["1"]);
    expect(ids({ query: "молоко" })).toEqual(["2"]);
  });
  it("«касаются меня» — платил я или есть доля", () => expect(ids({ scope: "involved" })).toEqual(["1", "2"]));
  it("«платил я»", () => expect(ids({ scope: "paid" })).toEqual(["2"]));
  it("категория", () => expect(ids({ category: "internet" })).toEqual(["3"]));
  it("isFiltering", () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering({ ...NO_FILTER, query: " " })).toBe(false);
    expect(isFiltering({ ...NO_FILTER, scope: "paid" })).toBe(true);
  });
});
