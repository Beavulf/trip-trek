import { describe, it, expect } from "vitest";
import { defaultDraft, draftFromExpense, draftFromRecurring, evaluateSplit, exactFromEqual, itemsFromExpense, recentTemplates, emptyDraft } from "./expense-form";
import { computeShares } from "./split";
import type { SplitExpenseDTO } from "./types";

const IDS = ["a", "b", "c"];

describe("evaluateSplit", () => {
  it("поровну: по умолчанию все участники", () => {
    const r = evaluateSplit("equal", defaultDraft(IDS), 3000, IDS);
    expect(r.error).toBeNull();
    expect(r.shares?.map((s) => s.cents)).toEqual([1000, 1000, 1000]);
  });

  it("поровну: никого не выбрали — понятная ошибка", () => {
    const d = { ...defaultDraft(IDS), selected: [] };
    expect(evaluateSplit("equal", d, 3000, IDS).error).toMatch(/на кого/);
  });

  it("суммы: показывает остаток и ошибку, пока не сходится", () => {
    const d = { ...emptyDraft(), exact: { a: "10", b: "5" } };
    const r = evaluateSplit("exact", d, 2000, IDS);
    expect(r.remainingCents).toBe(500);
    expect(r.error).not.toBeNull();
    const ok = evaluateSplit("exact", { ...d, exact: { a: "10", b: "10" } }, 2000, IDS);
    expect(ok.error).toBeNull();
    expect(ok.remainingCents).toBe(0);
  });

  it("суммы: перебор даёт отрицательный остаток", () => {
    const r = evaluateSplit("exact", { ...emptyDraft(), exact: { a: "30" } }, 2000, IDS);
    expect(r.remainingCents).toBe(-1000);
  });

  it("суммы: запятая как десятичный разделитель, мусор отвергается", () => {
    expect(evaluateSplit("exact", { ...emptyDraft(), exact: { a: "12,5", b: "7,5" } }, 2000, IDS).error).toBeNull();
    expect(evaluateSplit("exact", { ...emptyDraft(), exact: { a: "abc" } }, 2000, IDS).error).toMatch(/числа/);
  });

  it("доли: 2:1:0", () => {
    const d = { ...defaultDraft(IDS), weights: { a: 2, b: 1, c: 0 } };
    const r = evaluateSplit("shares", d, 9000, IDS);
    expect(r.shares?.map((s) => [s.memberId, s.cents])).toEqual([["a", 6000], ["b", 3000]]);
  });

  it("проценты: сумма и ошибка, пока не 100%", () => {
    const d = { ...emptyDraft(), percents: { a: "60", b: "30" } };
    const bad = evaluateSplit("percent", d, 10000, IDS);
    expect(bad.percentBp).toBe(9000);
    expect(bad.error).toMatch(/100%/);
    const ok = evaluateSplit("percent", { ...d, percents: { a: "60", b: "40" } }, 10000, IDS);
    expect(ok.error).toBeNull();
    expect(ok.shares?.map((s) => s.cents)).toEqual([6000, 4000]);
  });

  it("проценты по умолчанию из defaultDraft дают ровно 100%", () => {
    expect(evaluateSplit("percent", defaultDraft(IDS), 10000, IDS).error).toBeNull();
  });

  it("сумма ещё не введена — не ругаемся, но и долей нет", () => {
    const r = evaluateSplit("equal", defaultDraft(IDS), 0, IDS);
    expect(r.error).toBeNull();
    expect(r.shares).toBeNull();
  });
});

describe("draftFromExpense / exactFromEqual", () => {
  const expense = (over: Partial<SplitExpenseDTO>): SplitExpenseDTO => ({
    id: "e1",
    amountCents: 9000,
    originalAmountCents: null,
    originalCurrency: null,
    description: "Аренда",
    category: "rent",
    paidById: "a",
    spentOn: "2026-10-01",
    note: null,
    splitMode: "shares",
    shares: [
      { memberId: "a", cents: 6000, weight: 2 },
      { memberId: "b", cents: 3000, weight: 1 },
    ],
    createdById: "a",
    recurringId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  });

  it("правка доли: форма восстанавливается и пересчитывается в те же центы", () => {
    const e = expense({});
    const d = draftFromExpense(e, IDS);
    const r = evaluateSplit("shares", d, e.amountCents, IDS);
    expect(r.shares?.map((s) => s.cents)).toEqual([6000, 3000]);
  });

  it("правка процентов: 33,33% восстанавливается без потерь", () => {
    const e = expense({
      splitMode: "percent",
      amountCents: 10000,
      shares: [
        { memberId: "a", cents: 3334, weight: 3334 },
        { memberId: "b", cents: 3333, weight: 3333 },
        { memberId: "c", cents: 3333, weight: 3333 },
      ],
    });
    const r = evaluateSplit("percent", draftFromExpense(e, IDS), 10000, IDS);
    expect(r.error).toBeNull();
    expect(r.shares?.map((s) => s.cents)).toEqual([3334, 3333, 3333]);
  });

  it("правка точных сумм", () => {
    const e = expense({
      splitMode: "exact",
      amountCents: 1250,
      shares: [
        { memberId: "a", cents: 1000, weight: null },
        { memberId: "b", cents: 250, weight: null },
      ],
    });
    const r = evaluateSplit("exact", draftFromExpense(e, IDS), 1250, IDS);
    expect(r.shares?.map((s) => s.cents)).toEqual([1000, 250]);
  });

  it("переключение «поровну → суммы» переносит текущие доли", () => {
    expect(exactFromEqual(1000, ["a", "b", "c"])).toEqual({ a: "3,34", b: "3,33", c: "3,33" });
  });
});

describe("recentTemplates", () => {
  const e = (id: string, description: string, createdAt: string, recurringId: string | null = null): SplitExpenseDTO => ({
    id,
    amountCents: 100,
    originalAmountCents: null,
    originalCurrency: null,
    description,
    category: "transport",
    paidById: "a",
    spentOn: "2026-10-01",
    note: null,
    splitMode: "equal",
    shares: [{ memberId: "a", cents: 100, weight: null }],
    createdById: "a",
    recurringId,
    createdAt,
    updatedAt: createdAt,
  });

  it("уникальные по описанию, свежие первыми, без шаблонов аренды", () => {
    const list = recentTemplates([
      e("1", "Такси", "2026-10-01T10:00:00Z"),
      e("2", "такси ", "2026-10-03T10:00:00Z"),
      e("3", "Пятёрочка", "2026-10-02T10:00:00Z"),
      e("4", "Аренда", "2026-10-04T10:00:00Z", "r1"),
    ]);
    expect(list.map((t) => t.description)).toEqual(["такси ", "Пятёрочка"]);
  });
});

describe("itemsFromExpense", () => {
  it("возвращает вход, из которого сервер получит те же доли (для «Вернуть»)", () => {
    const cases = [
      { mode: "equal" as const, amount: 1000, items: [{ memberId: "a" }, { memberId: "b" }, { memberId: "c" }] },
      { mode: "exact" as const, amount: 1000, items: [{ memberId: "a", value: 700 }, { memberId: "b", value: 300 }] },
      { mode: "shares" as const, amount: 1000, items: [{ memberId: "a", value: 2 }, { memberId: "b", value: 1 }] },
      { mode: "percent" as const, amount: 1000, items: [{ memberId: "a", value: 3333 }, { memberId: "b", value: 6667 }] },
    ];
    for (const c of cases) {
      const first = computeShares(c.mode, c.amount, c.items);
      if (!first.ok) throw new Error(first.error);
      const again = computeShares(c.mode, c.amount, itemsFromExpense({ splitMode: c.mode, shares: first.shares }));
      expect(again).toEqual(first);
    }
  });
});

describe("draftFromRecurring", () => {
  it("шаблон с процентами 60/40 восстанавливается и даёт те же доли", () => {
    const d = draftFromRecurring(
      { splitMode: "percent", amountCents: 60000, template: [{ memberId: "a", value: 6000 }, { memberId: "b", value: 4000 }] },
      IDS
    );
    const r = evaluateSplit("percent", d, 60000, IDS);
    expect(r.shares?.map((s) => s.cents)).toEqual([36000, 24000]);
  });

  it("шаблон поровну: выбраны те, кто в шаблоне", () => {
    const d = draftFromRecurring({ splitMode: "equal", amountCents: 3000, template: [{ memberId: "a", value: null }, { memberId: "c", value: null }] }, IDS);
    expect(d.selected).toEqual(["a", "c"]);
  });
});
