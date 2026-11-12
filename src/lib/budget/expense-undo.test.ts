import { describe, expect, it } from "vitest";
import { expenseRestorePayload } from "./expense-undo";
import type { Expense } from "@/lib/types";

const base = {
  id: "e1",
  amount: 12.5,
  category: "food",
  description: "Ужин",
  paidById: "u1",
  paidBy: { id: "u1", name: "Ты", emoji: "🦊", color: "#f97316" } as Expense["paidBy"],
  dayId: "d1",
  day: null,
  createdAt: "2026-11-12T10:00:00.000Z",
} as Expense;

describe("expenseRestorePayload", () => {
  it("DTO → POST-тело: splitWith строка → массив, служебные поля отброшены", () => {
    const p = expenseRestorePayload({ ...base, splitWith: "u1,u2", excludeSelf: false }, "trip1", "abc");
    expect(p).toEqual({
      tripId: "trip1",
      amount: 12.5,
      category: "food",
      description: "Ужин",
      paidById: "u1",
      dayId: "d1",
      splitWith: ["u1", "u2"],
      excludeSelf: false,
      originalAmount: undefined,
      originalCurrency: undefined,
      settlementKey: undefined,
    });
  });

  it("пустой splitWith → пустой массив (личная трата)", () => {
    const p = expenseRestorePayload(base, "trip1", "abc");
    expect(p.splitWith).toEqual([]);
  });

  it("для перевода добавляется settlementKey с префиксом settle-undo-", () => {
    const p = expenseRestorePayload({ ...base, category: "settlement", excludeSelf: true }, "trip1", "abc");
    expect(p.settlementKey).toBe("settle-undo-abc");
    expect(p.excludeSelf).toBe(true);
  });

  it("null dayId → undefined (не null: контракт POST ждёт отсутствие)", () => {
    const p = expenseRestorePayload({ ...base, dayId: null }, "trip1", "abc");
    expect(p.dayId).toBeUndefined();
  });

  it("originalAmount/originalCurrency сохраняются", () => {
    const p = expenseRestorePayload({ ...base, originalAmount: 100, originalCurrency: "CNY" }, "trip1", "abc");
    expect(p.originalAmount).toBe(100);
    expect(p.originalCurrency).toBe("CNY");
  });
});
