import { describe, it, expect } from "vitest";
import { moneyParticipants, expenseUserIds, expenseSelectableParticipants } from "./people";
import { calculateBalances, calculateSettlements, calculateNetSpent, pairDebtCents } from "./balances";
import { calculatePersonalSpend } from "./personal";
import type { Expense, Participant } from "../types";

const mk = (id: string, role: string | null = "member"): Participant => ({
  id,
  name: id,
  color: "#000000",
  emoji: "🙂",
  role,
  budget: null,
});
const A = mk("A", "owner");
const B = mk("B");
const C = mk("C");
const V = mk("V", "viewer");

let seq = 0;
let clock = 0;
const exp = (over: Partial<Expense>): Expense => ({
  id: `e-${++seq}`,
  amount: 0,
  category: "food",
  description: "",
  paidById: "A",
  paidBy: A,
  dayId: null,
  day: null,
  splitWith: "",
  excludeSelf: false,
  createdAt: new Date(++clock).toISOString(),
  ...over,
});

describe("moneyParticipants", () => {
  it("зритель вне денег, пока не фигурирует в тратах", () => {
    const ids = moneyParticipants([A, B, V], [], []).map((p) => p.id);
    expect(ids).toEqual(["A", "B"]);
  });

  it("зритель остаётся в расчёте, если уже есть в тратах (роль сменили позже)", () => {
    const e = exp({ amount: 30, paidById: "A", splitWith: "V,B" });
    expect(moneyParticipants([A, B, V], [], [e]).map((p) => p.id)).toEqual(["A", "B", "V"]);
  });

  it("бывший участник добавляется с пометкой former, только если есть в тратах", () => {
    const ghost = mk("G");
    const e = exp({ amount: 30, paidById: "A", splitWith: "G" });
    const people = moneyParticipants([A, B], [ghost, mk("Z")], [e]);
    expect(people.map((p) => p.id)).toEqual(["A", "B", "G"]);
    expect(people.find((p) => p.id === "G")?.former).toBe(true);
  });

  it("id из трат без записи в списках — заглушка, а не молчаливая потеря", () => {
    const e = exp({ amount: 10, paidById: "A", splitWith: "???" });
    const people = moneyParticipants([A], [], [e]);
    expect(people.map((p) => p.id)).toEqual(["A", "???"]);
    expect(people[1].former).toBe(true);
  });

  it("expenseUserIds собирает плательщиков и делящих, пустые куски игнорирует", () => {
    const ids = expenseUserIds([exp({ paidById: "A", splitWith: "B,,C" }), exp({ paidById: "B", splitWith: "" })]);
    expect([...ids].sort()).toEqual(["A", "B", "C"]);
  });

  it("выбор для новой траты — без зрителей", () => {
    expect(expenseSelectableParticipants([A, B, V]).map((p) => p.id)).toEqual(["A", "B"]);
  });
});

describe("расчёт с вышедшим участником (регрессия: долги исчезали)", () => {
  // C заплатил за троих, A заплатил за B и C
  const expenses = [
    exp({ amount: 90, paidById: "C", splitWith: "A,B" }),
    exp({ amount: 60, paidById: "A", splitWith: "B,C", category: "transport" }),
  ];
  const full = [A, B, C];
  const afterLeave = moneyParticipants([A, B], [C], expenses); // C ушёл, но остался в тратах

  it("баланс каждого не меняется после ухода C", () => {
    const before = calculateBalances(expenses, full).map((b) => [b.participant.id, b.balance]);
    const after = calculateBalances(expenses, afterLeave).map((b) => [b.participant.id, b.balance]);
    expect(after).toEqual(before);
  });

  it("переводы с участием ушедшего остаются в списке", () => {
    const st = calculateSettlements(expenses, afterLeave).map((s) => `${s.from.id}→${s.to.id}:${s.amount}`);
    const stFull = calculateSettlements(expenses, full).map((s) => `${s.from.id}→${s.to.id}:${s.amount}`);
    expect(st).toEqual(stFull);
    expect(st.some((s) => s.includes("C"))).toBe(true);
  });

  it("Σ «Бюджет каждого» равна сумме трат поездки", () => {
    const net = calculateNetSpent(expenses, afterLeave);
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    expect(Object.values(net).reduce((a, b) => a + b, 0)).toBeCloseTo(total, 6);
  });
});

describe("calculatePersonalSpend: ушедший участник не роняет расчёт", () => {
  // встречные траты A↔X, X потом ушёл — раньше TypeError на взаимозачёте
  const expenses = [
    exp({ amount: 40, paidById: "A", splitWith: "X", excludeSelf: true }),
    exp({ amount: 30, paidById: "X", splitWith: "A", excludeSelf: true }),
  ];

  it("не бросает, когда X нет в списке пользователей", () => {
    expect(() => calculatePersonalSpend(expenses, ["A", "B"])).not.toThrow();
  });

  it("консервация: Σ по всем равна сумме трат, даже с вышедшим", () => {
    const r = calculatePersonalSpend(expenses, ["A", "B"]);
    const sum = Object.values(r).reduce((s, p) => s + p.total, 0);
    expect(sum).toBeCloseTo(70, 6);
  });

  it("итог для оставшихся тот же, что и с X в списке", () => {
    const withX = calculatePersonalSpend(expenses, ["A", "X"]);
    const without = calculatePersonalSpend(expenses, ["A", "B"]);
    expect(without.A.total).toBeCloseTo(withX.A.total, 6);
  });

  it("перевод вышедшему тоже переносит траты (раньше пропускался)", () => {
    const debt = exp({ amount: 100, paidById: "X", splitWith: "A", excludeSelf: true });
    const settle = exp({ amount: 100, paidById: "A", splitWith: "X", excludeSelf: true, category: "settlement" });
    const r = calculatePersonalSpend([debt, settle], ["A"]);
    expect(r.A.total).toBeCloseTo(100, 6); // A вернул долг — потребление теперь его
    expect(r.X.total).toBeCloseTo(0, 6);
  });
});

describe("pairDebtCents", () => {
  const e1 = exp({ amount: 100, paidById: "A", splitWith: "B", excludeSelf: true }); // B должен A 100
  it("считает долг пары в центах со знаком", () => {
    expect(pairDebtCents([e1], "B", "A")).toBe(10000);
    expect(pairDebtCents([e1], "A", "B")).toBe(-10000);
  });
  it("переводы гасят долг, а встречные траты неттятся", () => {
    const settle = exp({ amount: 40, paidById: "B", splitWith: "A", excludeSelf: true, category: "settlement" });
    const back = exp({ amount: 10, paidById: "B", splitWith: "A", excludeSelf: true });
    expect(pairDebtCents([e1, settle, back], "B", "A")).toBe(5000);
  });
  it("личные траты долгов не создают; чужие пары не мешают", () => {
    const personal = exp({ amount: 50, paidById: "A", splitWith: "" });
    const other = exp({ amount: 90, paidById: "C", splitWith: "B", excludeSelf: true });
    expect(pairDebtCents([personal, other], "B", "A")).toBe(0);
  });
  it("согласован с calculateSettlements", () => {
    const e = exp({ amount: 100, paidById: "A", splitWith: "B,C" });
    const st = calculateSettlements([e], [A, B, C]);
    const bToA = st.find((s) => s.from.id === "B" && s.to.id === "A")!;
    expect(pairDebtCents([e], "B", "A")).toBe(Math.round(bToA.amount * 100));
  });
});
