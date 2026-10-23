import { describe, it, expect } from "vitest";
import { computeShares, evenPercents, PERCENT_TOTAL, scaleShares, type SplitItem } from "./split";

const ids = (...n: string[]): SplitItem[] => n.map((memberId) => ({ memberId }));
const sum = (r: ReturnType<typeof computeShares>) => (r.ok ? r.shares.reduce((a, s) => a + s.cents, 0) : NaN);

describe("computeShares: поровну", () => {
  it("делит без остатка", () => {
    const r = computeShares("equal", 3000, ids("a", "b", "c"));
    expect(r).toEqual({
      ok: true,
      shares: [
        { memberId: "a", cents: 1000, weight: null },
        { memberId: "b", cents: 1000, weight: null },
        { memberId: "c", cents: 1000, weight: null },
      ],
    });
  });

  it("лишние копейки достаются первым по списку, сумма сохраняется", () => {
    const r = computeShares("equal", 1000, ids("a", "b", "c"));
    expect(r.ok && r.shares.map((s) => s.cents)).toEqual([334, 333, 333]);
    expect(sum(r)).toBe(1000);
  });

  it("один участник — вся сумма ему (личная трата)", () => {
    const r = computeShares("equal", 1250, ids("a"));
    expect(r.ok && r.shares).toEqual([{ memberId: "a", cents: 1250, weight: null }]);
  });

  it("копейка на троих: одна доля 1, остальные 0 — сумма сходится", () => {
    const r = computeShares("equal", 1, ids("a", "b", "c"));
    expect(r.ok && r.shares.map((s) => s.cents)).toEqual([1, 0, 0]);
  });

  it("отвергает пустой список, дубли, нулевую и дробную сумму", () => {
    expect(computeShares("equal", 100, []).ok).toBe(false);
    expect(computeShares("equal", 100, ids("a", "a")).ok).toBe(false);
    expect(computeShares("equal", 0, ids("a")).ok).toBe(false);
    expect(computeShares("equal", 10.5, ids("a")).ok).toBe(false);
  });
});

describe("computeShares: точные суммы", () => {
  it("принимает сходящиеся суммы и отбрасывает нулевые доли", () => {
    const r = computeShares("exact", 1000, [
      { memberId: "a", value: 700 },
      { memberId: "b", value: 300 },
      { memberId: "c", value: 0 },
    ]);
    expect(r.ok && r.shares).toEqual([
      { memberId: "a", cents: 700, weight: null },
      { memberId: "b", cents: 300, weight: null },
    ]);
  });

  it("не сходится с суммой траты — ошибка", () => {
    expect(
      computeShares("exact", 1000, [
        { memberId: "a", value: 700 },
        { memberId: "b", value: 200 },
      ]).ok
    ).toBe(false);
  });

  it("отрицательное и дробное значение — ошибка", () => {
    expect(computeShares("exact", 100, [{ memberId: "a", value: -100 }, { memberId: "b", value: 200 }]).ok).toBe(false);
    expect(computeShares("exact", 100, [{ memberId: "a", value: 50.5 }, { memberId: "b", value: 49.5 }]).ok).toBe(false);
  });
});

describe("computeShares: доли (веса)", () => {
  it("2:1 на 90,00 → 60,00 и 30,00", () => {
    const r = computeShares("shares", 9000, [
      { memberId: "a", value: 2 },
      { memberId: "b", value: 1 },
    ]);
    expect(r.ok && r.shares).toEqual([
      { memberId: "a", cents: 6000, weight: 2 },
      { memberId: "b", cents: 3000, weight: 1 },
    ]);
  });

  it("вес 0 — не участвует; остаток уходит тому, у кого дробная часть больше", () => {
    const r = computeShares("shares", 100, [
      { memberId: "a", value: 1 },
      { memberId: "b", value: 0 },
      { memberId: "c", value: 2 },
    ]);
    // 100/3: a=33.33, c=66.66 → c получает недостающую копейку
    expect(r.ok && r.shares.map((s) => [s.memberId, s.cents])).toEqual([
      ["a", 33],
      ["c", 67],
    ]);
  });

  it("все веса нулевые — ошибка", () => {
    expect(computeShares("shares", 100, [{ memberId: "a", value: 0 }]).ok).toBe(false);
  });
});

describe("computeShares: проценты", () => {
  it("60/40 от 1000,00", () => {
    const r = computeShares("percent", 100000, [
      { memberId: "a", value: 6000 },
      { memberId: "b", value: 4000 },
    ]);
    expect(r.ok && r.shares.map((s) => s.cents)).toEqual([60000, 40000]);
  });

  it("не 100% — ошибка", () => {
    expect(
      computeShares("percent", 1000, [
        { memberId: "a", value: 5000 },
        { memberId: "b", value: 4000 },
      ]).ok
    ).toBe(false);
  });

  it("evenPercents всегда даёт ровно 100%", () => {
    for (let n = 1; n <= 12; n++) {
      expect(evenPercents(n).reduce((a, b) => a + b, 0)).toBe(PERCENT_TOTAL);
    }
    expect(evenPercents(3)).toEqual([3334, 3333, 3333]);
  });
});

describe("computeShares: свойство «Σ долей = сумме траты»", () => {
  // Детерминированный генератор: тест воспроизводим
  let seed = 12345;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };

  it("равное и весовое деление на случайных входах", () => {
    for (let i = 0; i < 500; i++) {
      const amount = 1 + rnd(5_000_000);
      const n = 1 + rnd(9);
      const members = Array.from({ length: n }, (_, k) => `m${k}`);
      expect(sum(computeShares("equal", amount, members.map((memberId) => ({ memberId }))))).toBe(amount);

      const weights = members.map(() => rnd(6));
      if (!weights.some((w) => w > 0)) weights[0] = 1;
      const r = computeShares("shares", amount, members.map((memberId, k) => ({ memberId, value: weights[k] })));
      expect(sum(r)).toBe(amount);
      if (r.ok) expect(r.shares.every((s) => s.cents >= 0)).toBe(true);
    }
  });
});

describe("scaleShares", () => {
  it("сохраняет пропорции и сумму: точные доли 300/200 на новую сумму", () => {
    const r = scaleShares([{ memberId: "a", cents: 30000 }, { memberId: "b", cents: 20000 }], 161250);
    expect(r).toEqual([{ memberId: "a", cents: 96750 }, { memberId: "b", cents: 64500 }]);
  });

  it("остаток копеек — тому, у кого дробная часть больше; Σ всегда = новой сумме", () => {
    let seed = 99;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let i = 0; i < 300; i++) {
      const shares = Array.from({ length: 1 + rnd(6) }, (_, k) => ({ memberId: `m${k}`, cents: rnd(500_000) }));
      if (shares.every((s) => s.cents === 0)) shares[0].cents = 1;
      const newTotal = 1 + rnd(50_000_000);
      const r = scaleShares(shares, newTotal);
      expect(r.reduce((a, s) => a + s.cents, 0)).toBe(newTotal);
      expect(r.every((s, k) => s.cents >= 0 && (shares[k].cents > 0 || s.cents === 0))).toBe(true);
    }
  });

  it("крупные суммы не теряют точность (произведение больше 2^53)", () => {
    const r = scaleShares([{ memberId: "a", cents: 99_999_999 }, { memberId: "b", cents: 1 }], 99_999_999);
    expect(r.reduce((a, s) => a + s.cents, 0)).toBe(99_999_999);
  });

  it("нулевая база — нули, а не деление на ноль", () => {
    expect(scaleShares([{ memberId: "a", cents: 0 }], 1000)).toEqual([{ memberId: "a", cents: 0 }]);
  });
});
