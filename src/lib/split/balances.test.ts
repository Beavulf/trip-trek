import { describe, it, expect } from "vitest";
import { memberBalances, myTotals, pairDebts, pairNet, type LedgerExpense, type LedgerPayment } from "./balances";
import { computeShares } from "./split";

const A = "a";
const B = "b";
const C = "c";

function expense(paidById: string, amountCents: number, members: string[]): LedgerExpense {
  const r = computeShares("equal", amountCents, members.map((memberId) => ({ memberId })));
  if (!r.ok) throw new Error(r.error);
  return { amountCents, paidById, shares: r.shares };
}

describe("memberBalances", () => {
  it("сумма балансов всегда 0", () => {
    const exps = [expense(A, 9000, [A, B, C]), expense(B, 1001, [A, B, C])];
    const pays: LedgerPayment[] = [{ fromId: C, toId: A, amountCents: 500 }];
    const total = [...memberBalances(exps, pays).values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it("плательщик в плюсе на чужие доли, должники в минусе", () => {
    const bal = memberBalances([expense(A, 9000, [A, B, C])], []);
    expect(bal.get(A)).toBe(6000);
    expect(bal.get(B)).toBe(-3000);
    expect(bal.get(C)).toBe(-3000);
  });
});

describe("pairDebts", () => {
  it("кто за кого платил: B и C должны A по трети", () => {
    expect(pairDebts([expense(A, 9000, [A, B, C])], [])).toEqual([
      { fromId: B, toId: A, cents: 3000 },
      { fromId: C, toId: A, cents: 3000 },
    ]);
  });

  it("встречные траты неттятся в одну запись", () => {
    const exps = [expense(A, 4000, [A, B]), expense(B, 1000, [A, B])];
    // B должен A 2000, A должен B 500 → B должен A 1500
    expect(pairDebts(exps, [])).toEqual([{ fromId: B, toId: A, cents: 1500 }]);
  });

  it("перевод гасит долг ровно в ноль", () => {
    const exps = [expense(A, 4000, [A, B])];
    expect(pairDebts(exps, [{ fromId: B, toId: A, amountCents: 2000 }])).toEqual([]);
  });

  it("частичный перевод уменьшает долг", () => {
    const exps = [expense(A, 4000, [A, B])];
    expect(pairDebts(exps, [{ fromId: B, toId: A, amountCents: 500 }])).toEqual([{ fromId: B, toId: A, cents: 1500 }]);
  });

  it("перевод больше долга разворачивает долг", () => {
    const exps = [expense(A, 4000, [A, B])];
    expect(pairDebts(exps, [{ fromId: B, toId: A, amountCents: 2500 }])).toEqual([{ fromId: A, toId: B, cents: 500 }]);
  });

  it("плательщик не должен сам себе: личная трата долгов не создаёт", () => {
    expect(pairDebts([expense(A, 5000, [A])], [])).toEqual([]);
  });

  it("«заплатил за других, сам не участвую»: долг на всю сумму", () => {
    expect(pairDebts([expense(A, 5000, [B])], [])).toEqual([{ fromId: B, toId: A, cents: 5000 }]);
  });

  it("порядок детерминирован при равных суммах", () => {
    const exps = [expense(A, 9000, [A, B, C])];
    expect(pairDebts(exps, []).map((d) => d.fromId)).toEqual([B, C]);
    expect(pairDebts([...exps].reverse(), []).map((d) => d.fromId)).toEqual([B, C]);
  });
});

describe("pairNet и myTotals", () => {
  const exps = [expense(A, 9000, [A, B, C]), expense(B, 3000, [B, C])];

  it("pairNet: знак показывает, кто кому должен", () => {
    expect(pairNet(exps, [], B, A)).toBe(3000);
    expect(pairNet(exps, [], A, B)).toBe(-3000);
    expect(pairNet(exps, [], A, "zzz")).toBe(0);
  });

  it("myTotals: что должен я и что должны мне", () => {
    const debts = pairDebts(exps, []);
    // B: должен A 3000; C должен A 3000 и B 1500
    expect(myTotals(debts, A)).toEqual({ owe: 0, owed: 6000 });
    expect(myTotals(debts, B)).toEqual({ owe: 3000, owed: 1500 });
    expect(myTotals(debts, C)).toEqual({ owe: 4500, owed: 0 });
  });
});

describe("согласованность баланса и попарных долгов", () => {
  let seed = 777;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };

  it("для каждого участника Σ попарных долгов = его итоговый баланс (случайные траты и переводы)", () => {
    const people = ["p0", "p1", "p2", "p3", "p4"];
    for (let round = 0; round < 200; round++) {
      const exps: LedgerExpense[] = [];
      for (let i = 0; i < 1 + rnd(8); i++) {
        const members = people.filter(() => rnd(2) === 0);
        if (members.length === 0) members.push(people[rnd(people.length)]);
        exps.push(expense(people[rnd(people.length)], 1 + rnd(100_000), members));
      }
      const pays: LedgerPayment[] = [];
      for (let i = 0; i < rnd(4); i++) {
        const from = people[rnd(people.length)];
        const to = people[(people.indexOf(from) + 1 + rnd(people.length - 1)) % people.length];
        pays.push({ fromId: from, toId: to, amountCents: 1 + rnd(50_000) });
      }
      const bal = memberBalances(exps, pays);
      const debts = pairDebts(exps, pays);
      for (const p of people) {
        const t = myTotals(debts, p);
        expect(t.owed - t.owe).toBe(bal.get(p) ?? 0);
      }
    }
  });
});
