import { describe, it, expect } from "vitest";
import { calculateBalances, calculateSettlements, calculateNetSpent, expenseParticipants } from "./balances";
import { shareCents } from "./money";
import type { Expense, Participant } from "../types";

const A = "u-alice";
const B = "u-boris";
const C = "u-clara";

const participants: Participant[] = [
  { id: A, name: "Аня", color: "#111111", emoji: "🐱", role: "owner", budget: null },
  { id: B, name: "Боря", color: "#222222", emoji: "🐶", role: "member", budget: null },
  { id: C, name: "Клава", color: "#333333", emoji: "🦊", role: "member", budget: null },
];

let seq = 0;
let clock = 0;
const exp = (over: Partial<Expense>): Expense => ({
  id: `e-${++seq}`,
  amount: 0,
  category: "food",
  description: "",
  paidById: A,
  paidBy: participants[0],
  dayId: null,
  day: null,
  splitWith: "",
  excludeSelf: false,
  createdAt: new Date(++clock).toISOString(),
  ...over,
});

const settle = (from: string, to: string, amount: number) =>
  exp({ category: "settlement", paidById: from, splitWith: to, excludeSelf: true, amount });

// Нажатие «Перевели» по всем показанным долгам — как это делает пользователь в UI
function pressAllSettled(expenses: Expense[]) {
  for (let guard = 0; guard < 20; guard++) {
    const st = calculateSettlements(expenses, participants);
    if (st.length === 0) break;
    for (const s of st) expenses.push(settle(s.from.id, s.to.id, s.amount));
  }
}

describe("shareCents (копеечная раскладка долей)", () => {
  it("сумма долей равна сумме траты в центах — копейки не теряются", () => {
    for (const amount of [100, 0.01, 0.02, 33.33, 246.67, 999.99]) {
      for (const count of [1, 2, 3, 4, 7]) {
        const shares = shareCents(amount, count);
        expect(shares.reduce((s, x) => s + x, 0)).toBe(Math.round(amount * 100));
      }
    }
  });

  it("остаток раскладывается детерминированно — первым участникам", () => {
    // 100.00 на троих: 33.34 + 33.33 + 33.33
    expect(shareCents(100, 3)).toEqual([3334, 3333, 3333]);
  });
});

describe("calculateSettlements / calculateBalances (фантомные хвосты)", () => {
  it("регрессия: «Перевели» по всем долгам гасит пару ровно в ноль, без хвостов $0.01", () => {
    // Сценарий из багрепорта: серии трат «по третям» и нажатий «Перевели».
    // Раньше float-хвосты копились и баланс показывал «должен $0.01» без долга в списке.
    const expenses: Expense[] = [];
    for (let round = 0; round < 8; round++) {
      expenses.push(exp({ amount: 100, paidById: A, splitWith: `${B},${C}` }));
      expenses.push(exp({ amount: 90, paidById: B, splitWith: `${A},${C}` }));
      pressAllSettled(expenses);
      // После нажатий долгов быть не должно ни на одном раунде
      expect(calculateSettlements(expenses, participants)).toEqual([]);
    }
    const balances = calculateBalances(expenses, participants);
    for (const b of balances) expect(b.balance).toBe(0);
  });

  it("трети не рождают фантомный баланс: долг есть только пока перевод не нажат", () => {
    const expenses = [exp({ amount: 100, paidById: A, splitWith: `${B},${C}` })];
    const st = calculateSettlements(expenses, participants);
    // 33.34 + 33.33: долг каждой пары точен до цента
    expect(st.map((s) => s.amount)).toEqual([33.34, 33.33]);
    pressAllSettled(expenses);
    expect(calculateSettlements(expenses, participants)).toEqual([]);
    for (const b of calculateBalances(expenses, participants)) {
      expect(b.balance).toBe(0);
      expect(b.owedToMe).toBe(b.owedToOthers);
    }
  });

  it("сумма балансов всегда 0 (консервация)", () => {
    const expenses = [
      exp({ amount: 100.01, paidById: A, splitWith: `${B},${C}` }),
      exp({ amount: 0.03, paidById: C, splitWith: `${A},${B}` }),
      settle(B, A, 50),
    ];
    const balances = calculateBalances(expenses, participants);
    expect(balances.reduce((s, b) => s + b.balance, 0)).toBeCloseTo(0, 10);
  });

  it("балансы цент-точны: «ровно» достижимо, подсветка не мерцает от пыли", () => {
    // 10.00 на троих: доли 3.34/3.33/3.33 — в float были хвосты вида 0.006666…
    const expenses = [
      exp({ amount: 10, paidById: A, splitWith: `${B},${C}` }),
      settle(B, A, 3.34),
      settle(C, A, 3.33),
    ];
    const balances = calculateBalances(expenses, participants);
    expect(balances.find((b) => b.participant.id === A)!.balance).toBe(0);
    expect(balances.find((b) => b.participant.id === B)!.balance).toBe(0);
    expect(balances.find((b) => b.participant.id === C)!.balance).toBe(0);
  });

  it("calculateNetSpent: переводы и суммы цент-точны", () => {
    const expenses = [
      exp({ amount: 100, paidById: A, splitWith: `${B},${C}` }),
      settle(B, A, 33.34),
      settle(C, A, 33.33),
    ];
    const net = calculateNetSpent(expenses, participants);
    // Аня потратила свою треть, Боря и Клава — свои доли из долгов
    expect(net[A]).toBeCloseTo(33.33, 10);
    expect(net[B]).toBeCloseTo(33.34, 10);
    expect(net[C]).toBeCloseTo(33.33, 10);
  });
});

describe("expenseParticipants (детерминированный порядок)", () => {
  it("splitWith из БД, плательщик последним когда участвует", () => {
    expect(expenseParticipants(exp({ amount: 10, paidById: B, splitWith: `${C},${A}` }))).toEqual([
      C, A, B,
    ]);
    expect(
      expenseParticipants(exp({ amount: 10, paidById: B, splitWith: `${C},${A}`, excludeSelf: true }))
    ).toEqual([C, A]);
  });
});
