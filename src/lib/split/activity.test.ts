import { describe, it, expect } from "vitest";
import { diffExpense, type ExpenseSnapshot } from "./activity";

const snap = (over: Partial<ExpenseSnapshot> = {}): ExpenseSnapshot => ({
  description: "Пятёрочка",
  amountCents: 3000,
  category: "groceries",
  paidById: "a",
  spentOn: "2026-10-22",
  note: null,
  splitMode: "equal",
  shares: [
    { memberId: "a", cents: 1500 },
    { memberId: "b", cents: 1500 },
  ],
  ...over,
});

describe("diffExpense", () => {
  it("ничего не поменялось — пустой дифф", () => {
    expect(diffExpense(snap(), snap())).toEqual([]);
  });

  it("порядок долей не считается изменением", () => {
    const reversed = snap({ shares: [...snap().shares].reverse() });
    expect(diffExpense(snap(), reversed)).toEqual([]);
  });

  it("сумма и описание — с прежним и новым значением", () => {
    expect(diffExpense(snap(), snap({ amountCents: 4500, description: "Евроопт" }))).toEqual([
      { field: "amountCents", from: 3000, to: 4500 },
      { field: "description", from: "Пятёрочка", to: "Евроопт" },
    ]);
  });

  it("смена круга или режима деления — одно изменение split", () => {
    expect(diffExpense(snap(), snap({ shares: [{ memberId: "a", cents: 3000 }] }))).toEqual([{ field: "split" }]);
    expect(diffExpense(snap(), snap({ splitMode: "shares" }))).toEqual([{ field: "split" }]);
  });

  it("правка только суммы при равном делении — не «смена деления», хотя доли в центах сдвинулись", () => {
    const after = snap({
      amountCents: 4500,
      shares: [
        { memberId: "a", cents: 2250 },
        { memberId: "b", cents: 2250 },
      ],
    });
    expect(diffExpense(snap(), after)).toEqual([{ field: "amountCents", from: 3000, to: 4500 }]);
  });

  it("точные суммы: смена суммы человека — смена деления; веса долей — тоже", () => {
    const exact = (a: number, b: number) =>
      snap({ splitMode: "exact", shares: [{ memberId: "a", cents: a }, { memberId: "b", cents: b }] });
    expect(diffExpense(exact(1000, 2000), exact(1500, 1500))).toEqual([{ field: "split" }]);
    const w = (wa: number, wb: number) =>
      snap({ splitMode: "shares", shares: [{ memberId: "a", cents: 1, weight: wa }, { memberId: "b", cents: 2, weight: wb }] });
    expect(diffExpense(w(1, 2), w(1, 2))).toEqual([]);
    expect(diffExpense(w(1, 2), w(2, 1))).toEqual([{ field: "split" }]);
  });

  it("смена валюты ввода — отдельное изменение «original», сумма в валюте группы может не поменяться", () => {
    const d = diffExpense(snap(), snap({ original: "USD:1000" }));
    expect(d).toEqual([{ field: "original", from: null, to: "USD:1000" }]);
    expect(diffExpense(snap({ original: "USD:1000" }), snap({ original: "USD:1000" }))).toEqual([]);
  });
});
