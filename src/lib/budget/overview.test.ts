import { describe, it, expect } from "vitest";
import type { Participant } from "@/lib/types";
import type { Settlement } from "./balances";
import { budgetMeter, buildCategoryRows, myDebts } from "./overview";

describe("budgetMeter", () => {
  it("без лимита сравнивать не с чем", () => {
    expect(budgetMeter(100, null).state).toBe("none");
    expect(budgetMeter(100, 0).state).toBe("none");
    expect(budgetMeter(100, undefined).fillPct).toBe(0);
  });

  it("в пределах лимита заливка пропорциональна, лимит на правом краю", () => {
    const m = budgetMeter(250, 1000);
    expect(m).toMatchObject({ state: "ok", remaining: 750, overBy: 0, percent: 25, fillPct: 25, limitPct: 100 });
  });

  it("от 85% предупреждает", () => {
    expect(budgetMeter(849, 1000).state).toBe("ok");
    expect(budgetMeter(850, 1000).state).toBe("near");
  });

  it("ровно в лимит — ещё не перерасход", () => {
    expect(budgetMeter(1000, 1000)).toMatchObject({ state: "near", remaining: 0, overBy: 0, percent: 100 });
  });

  it("при перерасходе шкала тянется до потраченного, а лимит уезжает влево", () => {
    const m = budgetMeter(1250, 1000);
    expect(m).toMatchObject({ state: "over", remaining: -250, overBy: 250, percent: 125, fillPct: 100 });
    expect(m.limitPct).toBeCloseTo(80);
  });

  it("считает в центах: хвосты float не попадают в итог", () => {
    expect(budgetMeter(0.1 + 0.2, 1).remaining).toBe(0.7);
    expect(budgetMeter(6743.09, 5814.82).overBy).toBe(928.27);
  });

  it("отрицательные траты не ломают шкалу", () => {
    expect(budgetMeter(-5, 100)).toMatchObject({ state: "ok", fillPct: 0, remaining: 100 });
  });
});

describe("buildCategoryRows", () => {
  const cats = ["food", "transport", "casino", "other"];

  it("план складывается из ручной части и маршрута", () => {
    const [row] = buildCategoryRows(["food"], { food: 10 }, { food: 100 }, { food: 50 });
    expect(row).toMatchObject({ manual: 100, fromRoute: 50, plan: 150 });
  });

  it("категории без плана и трат скрыты", () => {
    const rows = buildCategoryRows(cats, { food: 10 }, {}, { casino: 700 });
    expect(rows.map((r) => r.key)).toEqual(["food", "casino"]);
  });

  it("сначала самые затратные, при равных — с большим планом", () => {
    const rows = buildCategoryRows(cats, { food: 10, transport: 90 }, { casino: 1, other: 5 }, {});
    expect(rows.map((r) => r.key)).toEqual(["transport", "food", "other", "casino"]);
  });

  it("доля считается от всех трат", () => {
    const rows = buildCategoryRows(cats, { food: 25, transport: 75 }, {}, {});
    expect(rows.map((r) => r.sharePct)).toEqual([75, 25]);
  });
});

describe("myDebts", () => {
  const p = (id: string) => ({ id }) as Participant;
  const s = (from: string, to: string, amount: number): Settlement => ({ from: p(from), to: p(to), amount });

  it("разделяет, кому должен я и кто должен мне", () => {
    const list = [s("me", "a", 10), s("b", "me", 4.5), s("a", "b", 100)];
    expect(myDebts(list, "me")).toEqual({ iOwe: 10, owedToMe: 4.5 });
  });

  it("чужие переводы не считаются", () => {
    expect(myDebts([s("a", "b", 100)], "me")).toEqual({ iOwe: 0, owedToMe: 0 });
  });

  it("складывает без хвостов float", () => {
    expect(myDebts([s("me", "a", 0.1), s("me", "b", 0.2)], "me").iOwe).toBe(0.3);
  });
});
