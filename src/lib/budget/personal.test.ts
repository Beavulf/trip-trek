import { describe, it, expect } from "vitest";
import { calculatePersonalSpend } from "./personal";
import { calculateNetSpent } from "./balances";
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

const foodOf = (p: ReturnType<typeof calculatePersonalSpend>, id: string) => p[id].byCategory["food"] ?? 0;
const totalOf = (p: ReturnType<typeof calculatePersonalSpend>, id: string) => p[id].total;
const groupTotal = (p: ReturnType<typeof calculatePersonalSpend>) =>
  participants.reduce((s, x) => s + p[x.id].total, 0);

// Сценарий из запроса: «заплатил за троих 200 в Питание; друг вернул — у меня минус, у него плюс»
describe("calculatePersonalSpend (модель реальных денег)", () => {
  it("заплатил за троих $200 — вся сумма у плательщика, у друзей 0", () => {
    const dinner = exp({ amount: 200, paidById: A, splitWith: `${B},${C}` });
    const p = calculatePersonalSpend([dinner], [A, B, C]);
    expect(foodOf(p, A)).toBeCloseTo(200);
    expect(foodOf(p, B)).toBeCloseTo(0);
    expect(foodOf(p, C)).toBeCloseTo(0);
  });

  it("первый друг вернул свою часть — у меня минус, у него плюс, у третьего ничего", () => {
    const dinner = exp({ amount: 200, paidById: A, splitWith: `${B},${C}` });
    const back = settle(B, A, 200 / 3);
    const p = calculatePersonalSpend([dinner, back], [A, B, C]);
    expect(foodOf(p, A)).toBeCloseTo(200 - 200 / 3);
    expect(foodOf(p, B)).toBeCloseTo(200 / 3);
    expect(foodOf(p, C)).toBeCloseTo(0);
    expect(groupTotal(p)).toBeCloseTo(200);
  });

  it("вернули оба друга — модель сходится к честным третям", () => {
    const dinner = exp({ amount: 200, paidById: A, splitWith: `${B},${C}` });
    const p = calculatePersonalSpend([dinner, settle(B, A, 200 / 3), settle(C, A, 200 / 3)], [A, B, C]);
    expect(foodOf(p, A)).toBeCloseTo(200 / 3);
    expect(foodOf(p, B)).toBeCloseTo(200 / 3);
    expect(foodOf(p, C)).toBeCloseTo(200 / 3);
    expect(groupTotal(p)).toBeCloseTo(200);
  });

  it("заплатил только за друга (excludeSelf) — вся трата у плательщика, у друга 0", () => {
    // «Я заплатил за друга, только за него» — деньги вышли из моего кошелька,
    // у друга появляется только долг (гасится переводом), но не трата в аналитике.
    const e = exp({ amount: 50, paidById: A, splitWith: B, excludeSelf: true });
    const p = calculatePersonalSpend([e], [A, B]);
    expect(foodOf(p, A)).toBeCloseTo(50);
    expect(foodOf(p, B)).toBeCloseTo(0);
    // долг записан: после перевода Бора трата целиком уйдёт ему
    const p2 = calculatePersonalSpend([e, settle(B, A, 50)], [A, B]);
    expect(foodOf(p2, A)).toBeCloseTo(0);
    expect(foodOf(p2, B)).toBeCloseTo(50);
  });

  it("частичный возврат долга делит трату пропорционально возвращённому", () => {
    const e = exp({ amount: 100, paidById: A, splitWith: `${B},${C}`, excludeSelf: true });
    const p = calculatePersonalSpend([e, settle(B, A, 30)], [A, B, C]);
    expect(foodOf(p, A)).toBeCloseTo(70);
    expect(foodOf(p, B)).toBeCloseTo(30);
    expect(foodOf(p, C)).toBeCloseTo(0);
  });

  it("взаимозачёт: он заплатил за меня столько же — доли меняются местами без переводов", () => {
    // Я заплатил $50 за еду Лёхи; он заплатил $50 за мою еду. Долги гасятся встречно,
    // и в аналитике каждая трата переходит к тому, кто её потребил.
    const e1 = exp({ amount: 50, paidById: A, splitWith: B, excludeSelf: true });
    const e2 = exp({ amount: 50, paidById: B, splitWith: A, excludeSelf: true });
    const p = calculatePersonalSpend([e1, e2], [A, B]);
    expect(totalOf(p, A)).toBeCloseTo(50);
    expect(totalOf(p, B)).toBeCloseTo(50);
  });

  it("взаимозачёт с частичным покрытием: «платил за себя и меня» компенсирует только мою половину", () => {
    // Я заплатил $50 только за Лёху; он заплатил $80 за себя и меня (моя доля $40).
    // Зачёт $40: у меня остаётся $10 его непогашенного долга + $40 моей доли его траты = $50.
    const e1 = exp({ amount: 50, paidById: A, splitWith: B, excludeSelf: true });
    const e2 = exp({ amount: 80, paidById: B, splitWith: A, excludeSelf: false });
    const p = calculatePersonalSpend([e1, e2], [A, B]);
    expect(totalOf(p, A)).toBeCloseTo(50);
    expect(totalOf(p, B)).toBeCloseTo(80);
  });

  it("зачёт + перевод: после гашения нетто сходится в доли потребления", () => {
    const e1 = exp({ amount: 50, paidById: A, splitWith: B, excludeSelf: true });
    const e2 = exp({ amount: 30, paidById: B, splitWith: A, excludeSelf: true });
    const p = calculatePersonalSpend([e1, e2, settle(B, A, 20)], [A, B]);
    expect(totalOf(p, A)).toBeCloseTo(30);
    expect(totalOf(p, B)).toBeCloseTo(50);
  });

  it("взаимные долги, гасят нетто: итог — ровно доли потребления", () => {
    // Аня заплатила $60 за себя и Борю (по $30), Боря — $90 за себя и Аню (по $45).
    // Нетто-должник — Аня ($45 − $30 = $15). После перевода у каждого должно быть по $75.
    const e1 = exp({ amount: 60, paidById: A, splitWith: B });
    const e2 = exp({ amount: 90, paidById: B, splitWith: A });
    const p = calculatePersonalSpend([e1, e2, settle(A, B, 15)], [A, B]);
    expect(totalOf(p, A)).toBeCloseTo(75);
    expect(totalOf(p, B)).toBeCloseTo(75);
  });

  it("перенос идёт в категории и дне исходной траты", () => {
    const dinner = exp({ amount: 90, paidById: A, splitWith: B, dayId: "day-2" });
    const p = calculatePersonalSpend([dinner, settle(B, A, 45)], [A, B]);
    expect(p[B].byDay["day-2"]).toBeCloseTo(45);
    expect(p[A].byDay["day-2"]).toBeCloseTo(45);
    expect(p[B].byCategory["food"]).toBeCloseTo(45);
  });

  it("адхок-перевод без долгов распределяется пропорционально тратам кредитора", () => {
    const personal = exp({ amount: 60, paidById: B }); // личная Бори
    const shared = exp({ amount: 40, paidById: B, splitWith: C, category: "transport" }); // общий с Клавой
    const p = calculatePersonalSpend([personal, shared, settle(A, B, 10)], [A, B, C]);
    // У Ани нет долгов перед Борей — перевод гасится пропорционально тратам Бори: food −6, transport −4.
    // Аня получает плюс в тех же категориях. Консервация: всего по-прежнему 60 + 40 = 100.
    expect(foodOf(p, B)).toBeCloseTo(54);
    expect(p[B].byCategory["transport"]).toBeCloseTo(36);
    expect(foodOf(p, A)).toBeCloseTo(6);
    expect(p[A].byCategory["transport"]).toBeCloseTo(4);
    expect(groupTotal(p)).toBeCloseTo(100);
  });

  it("тотал каждого совпадает с calculateNetSpent (историческая формула)", () => {
    const expenses = [
      exp({ amount: 3000, paidById: A, splitWith: `${B},${C}` }),
      exp({ amount: 900, paidById: B }),
      exp({ amount: 1200, paidById: C, splitWith: A, excludeSelf: true }),
      settle(B, A, 500),
    ];
    const p = calculatePersonalSpend(expenses, [A, B, C]);
    const net = calculateNetSpent(expenses, participants);
    for (const x of participants) {
      expect(p[x.id].total).toBeCloseTo(net[x.id]);
    }
  });
});
