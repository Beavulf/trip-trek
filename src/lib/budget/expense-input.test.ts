import { describe, it, expect } from "vitest";
import { normalizeExpenseInput, checkSettlementAgainstDebt, MAX_EXPENSE_AMOUNT } from "./expense-input";

const base = { amount: 90, category: "food", description: "Ужин", paidById: "A" };
const ok = (over: Record<string, unknown> = {}) => {
  const r = normalizeExpenseInput({ ...base, ...over });
  if (!r.ok) throw new Error(`ожидался ok, получено: ${r.error}`);
  return r.value;
};
const bad = (over: Record<string, unknown> = {}) => {
  const r = normalizeExpenseInput({ ...base, ...over });
  if (r.ok) throw new Error("ожидалась ошибка");
  return r.error;
};

describe("normalizeExpenseInput — сумма", () => {
  it("округляет до центов и принимает числовую строку", () => {
    expect(ok({ amount: 12.345 }).amount).toBe(12.35);
    expect(ok({ amount: "15,5" }).amount).toBe(15.5);
  });
  it("отклоняет 0, отрицательные, NaN, мусор и сверхлимит", () => {
    for (const amount of [0, -5, NaN, Infinity, "12abc", "", null, undefined, MAX_EXPENSE_AMOUNT + 1]) {
      bad({ amount });
    }
  });
  it("сумма, округлённая до нуля, отклоняется", () => {
    bad({ amount: 0.004 });
  });
});

describe("normalizeExpenseInput — делёж (регрессия: плательщик и дубли в splitWith искажали долги)", () => {
  it("плательщик в splitWith = участвует в делении и убирается из списка", () => {
    const v = ok({ splitWith: ["A", "B"], excludeSelf: true });
    expect(v.splitWith).toEqual(["B"]);
    expect(v.excludeSelf).toBe(false);
  });
  it("дубли схлопываются", () => {
    expect(ok({ splitWith: ["B", "B", "C"], excludeSelf: true }).splitWith).toEqual(["B", "C"]);
  });
  it("excludeSelf честно сохраняется, когда плательщика в списке нет", () => {
    const v = ok({ splitWith: ["B"], excludeSelf: true });
    expect(v.splitWith).toEqual(["B"]);
    expect(v.excludeSelf).toBe(true);
  });
  it("пустой делёж — личная трата, excludeSelf сбрасывается", () => {
    const v = ok({ splitWith: [], excludeSelf: true });
    expect(v.splitWith).toEqual([]);
    expect(v.excludeSelf).toBe(false);
  });
  it("не-строки в splitWith игнорируются", () => {
    expect(ok({ splitWith: ["B", 5, null, ""] }).splitWith).toEqual(["B"]);
  });
});

describe("normalizeExpenseInput — категория и описание", () => {
  it("неизвестная категория отклоняется, settlement — нет", () => {
    bad({ category: "casino-royale" });
    bad({ category: "" });
    expect(normalizeExpenseInput({ ...base, category: "other" }).ok).toBe(true);
  });
  it("описание обрезается по краям и ограничено 500", () => {
    expect(ok({ description: "  кофе  " }).description).toBe("кофе");
    bad({ description: "x".repeat(501) });
    bad({ description: "   " });
  });
});

describe("normalizeExpenseInput — перевод (settlement)", () => {
  const settle = { category: "settlement", paidById: "B", splitWith: ["A"], excludeSelf: true, settlementKey: "settle-B-A-10000-1" };
  it("валидный перевод проходит, день не сохраняется", () => {
    const v = ok({ ...settle, dayId: "d1" });
    expect(v.settlementKey).toBe("settle-B-A-10000-1");
    expect(v.dayId).toBeNull();
    expect(v.excludeSelf).toBe(true);
  });
  it("нужен ключ идемпотентности", () => {
    bad({ ...settle, settlementKey: undefined });
    bad({ ...settle, settlementKey: "abc" });
  });
  it("ровно один получатель, не сам плательщик", () => {
    bad({ ...settle, splitWith: ["A", "C"] });
    bad({ ...settle, splitWith: [] });
    bad({ ...settle, splitWith: ["B"] }); // получатель = плательщик → после чистки список пуст
  });
  it("перевод без excludeSelf отклоняется", () => {
    bad({ ...settle, excludeSelf: false });
  });
  it("settlementKey у обычной траты игнорируется", () => {
    expect(ok({ settlementKey: "settle-x" }).settlementKey).toBeNull();
  });
});

describe("normalizeExpenseInput — исходная сумма", () => {
  it("сохраняется только парой «сумма + валюта из 3 букв»", () => {
    const v = ok({ originalAmount: 100, originalCurrency: "cny" });
    expect(v.originalAmount).toBe(100);
    expect(v.originalCurrency).toBe("CNY");
    expect(ok({ originalAmount: 100 }).originalAmount).toBeNull();
    expect(ok({ originalAmount: -5, originalCurrency: "CNY" }).originalAmount).toBeNull();
    expect(ok({ originalAmount: 100, originalCurrency: "yuan!" }).originalCurrency).toBeNull();
  });
});

describe("checkSettlementAgainstDebt — перевод не больше реального долга", () => {
  // B должен A 100: A заплатил за двоих 200
  const debt = { amount: 200, paidById: "A", splitWith: "B", excludeSelf: false };
  const paid = (amount: number) => ({ amount, paidById: "B", splitWith: "A", excludeSelf: true });

  it("перевод ровно на сумму долга проходит", () => {
    expect(checkSettlementAgainstDebt([debt], "B", "A", 100).ok).toBe(true);
  });
  it("частичный перевод проходит", () => {
    expect(checkSettlementAgainstDebt([debt], "B", "A", 40).ok).toBe(true);
  });
  it("перевод больше долга — 409 (раньше создавал встречный долг)", () => {
    const r = checkSettlementAgainstDebt([debt], "B", "A", 130);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.error).toContain("100.00");
    }
  });
  it("второй клик «Перевели» после уже записанного перевода — 409, а не переплата", () => {
    const r = checkSettlementAgainstDebt([debt, paid(100)], "B", "A", 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });
  it("остаток после частичного перевода можно закрыть", () => {
    expect(checkSettlementAgainstDebt([debt, paid(40)], "B", "A", 60).ok).toBe(true);
    expect(checkSettlementAgainstDebt([debt, paid(40)], "B", "A", 60.01).ok).toBe(false);
  });
  it("нет долга вообще — 409; перевод не в ту сторону — 409", () => {
    expect(checkSettlementAgainstDebt([], "B", "A", 10).ok).toBe(false);
    expect(checkSettlementAgainstDebt([debt], "A", "B", 10).ok).toBe(false); // A никому не должен
  });
  it("встречные траты неттятся: платить можно только разницу", () => {
    const back = { amount: 30, paidById: "B", splitWith: "A", excludeSelf: true }; // A должен B 30
    expect(checkSettlementAgainstDebt([debt, back], "B", "A", 70).ok).toBe(true);
    expect(checkSettlementAgainstDebt([debt, back], "B", "A", 70.01).ok).toBe(false);
  });
});
