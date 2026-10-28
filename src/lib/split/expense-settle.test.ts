import { describe, it, expect } from "vitest";
import { expenseSettlement, myExpenseState, nettedShareMark, paymentsByExpense, type ExpenseCore, type PaymentLink } from "./expense-settle";
import { formatCents } from "./money";

const internet: ExpenseCore = {
  id: "e1",
  paidById: "a",
  shares: [
    { memberId: "a", cents: 1000 },
    { memberId: "b", cents: 1000 },
    { memberId: "c", cents: 1000 },
  ],
};
const pay = (over: Partial<PaymentLink>): PaymentLink => ({ expenseId: "e1", fromId: "b", toId: "a", amountCents: 1000, ...over });

describe("expenseSettlement", () => {
  it("плательщик себе не должен: только доли остальных", () => {
    expect(expenseSettlement(internet, []).map((r) => [r.memberId, r.shareCents, r.remainingCents])).toEqual([
      ["b", 1000, 1000],
      ["c", 1000, 1000],
    ]);
  });

  it("перевод за эту трату закрывает долю ровно в ноль", () => {
    const r = expenseSettlement(internet, [pay({})]);
    expect(r.find((x) => x.memberId === "b")).toMatchObject({ paidCents: 1000, remainingCents: 0 });
    expect(r.find((x) => x.memberId === "c")).toMatchObject({ paidCents: 0, remainingCents: 1000 });
  });

  it("частичный перевод оставляет остаток, переплата не уходит в минус", () => {
    expect(expenseSettlement(internet, [pay({ amountCents: 400 })])[0]).toMatchObject({ paidCents: 400, remainingCents: 600 });
    expect(expenseSettlement(internet, [pay({ amountCents: 1700 })])[0]).toMatchObject({ paidCents: 1700, remainingCents: 0 });
  });

  it("несколько переводов за одну трату суммируются", () => {
    expect(expenseSettlement(internet, [pay({ amountCents: 300 }), pay({ amountCents: 500 })])[0].remainingCents).toBe(200);
  });

  it("переводы в обратную сторону или от другого человека долю не закрывают", () => {
    const r = expenseSettlement(internet, [pay({ fromId: "a", toId: "b" }), pay({ fromId: "c" })]);
    expect(r.find((x) => x.memberId === "b")?.paidCents).toBe(0);
    expect(r.find((x) => x.memberId === "c")?.paidCents).toBe(1000);
  });
});

describe("myExpenseState", () => {
  it("я должен: видно долю, что уже отдано и остаток", () => {
    expect(myExpenseState(internet, [pay({ amountCents: 400 })], "b")).toEqual({ kind: "owe", shareCents: 1000, paidCents: 400, remainingCents: 600 });
  });

  it("я платил: сколько мне должны всего и сколько ещё не вернули", () => {
    expect(myExpenseState(internet, [pay({})], "a")).toEqual({ kind: "lent", totalCents: 2000, remainingCents: 1000 });
  });

  it("платил я только за себя / меня в трате нет — none", () => {
    expect(myExpenseState({ id: "e", paidById: "a", shares: [{ memberId: "a", cents: 500 }] }, [], "a")).toEqual({ kind: "none" });
    expect(myExpenseState(internet, [], "zzz")).toEqual({ kind: "none" });
  });
});

describe("paymentsByExpense", () => {
  it("группирует по трате и пропускает переводы без привязки", () => {
    const m = paymentsByExpense([pay({}), pay({ expenseId: null }), pay({ expenseId: "e2" }), pay({ amountCents: 5 })]);
    expect([...m.keys()].sort()).toEqual(["e1", "e2"]);
    expect(m.get("e1")).toHaveLength(2);
  });
});

describe("nettedShareMark", () => {
  // Intl ставит неразрывные пробелы в «910 ₽» и группировке «1 000» — сравниваем через formatCents
  const rub = (cents: number) => formatCents(cents, "RUB");

  it("сценарий взаимозачёта: платил я, встречные траты свели нетто против доли — баланс откатывается вперёд", () => {
    // Я платил за Игоря 90 ₽, но и так должен ему 910 ₽: отметка «он вернул живыми» делает долг 1000 ₽
    const t = nettedShareMark({ payerIsViewer: true, sharerIsViewer: false, shareCents: 9000, netCents: -91000, currency: "RUB" });
    expect(t.body).toContain(`ты должен(на) ${rub(91000)}`);
    expect(t.body).toContain(`ты должен(на) ${rub(100000)}`);
    expect(t.body).toContain(rub(9000));
    expect(t.confirm).toBe("Всё равно отметить");
  });

  it("я дольщик: нетто против моего долга — отметка уходит в «тебе должны»", () => {
    // Мне должны 90 ₽, я «вернул» свою долю 10 ₽ деньгами — должны станут 100 ₽
    const t = nettedShareMark({ payerIsViewer: false, sharerIsViewer: true, shareCents: 1000, netCents: -9000, currency: "RUB" });
    expect(t.body).toContain(`тебе должны ${rub(9000)}`);
    expect(t.body).toContain(`тебе должны ${rub(10000)}`);
  });

  it("паритет (нетто 0): было «в расчёте», отметка дольщика-не-зрителя увеличивает мой долг", () => {
    const t = nettedShareMark({ payerIsViewer: true, sharerIsViewer: false, shareCents: 9000, netCents: 0, currency: "RUB" });
    expect(t.body).toContain("в расчёте");
    expect(t.body).toContain(`ты должен(на) ${rub(9000)}`);
  });
});
