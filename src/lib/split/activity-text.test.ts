import { describe, it, expect } from "vitest";
import { describeActivity } from "./activity-text";
import type { SplitActivityDTO } from "./types";

const names: Record<string, string> = { a: "Аня", b: "Борис" };
const nameOf = (id: string) => names[id] ?? "Бывший участник";
const act = (type: string, data: Record<string, unknown>, actorId: string | null = "a"): SplitActivityDTO => ({
  id: "x",
  actorId,
  type,
  data,
  createdAt: "2026-10-23T10:00:00.000Z",
});

describe("describeActivity", () => {
  it("добавление траты", () => {
    expect(describeActivity(act("expense.created", { description: "Пятёрочка", amountCents: 4500 }), nameOf, "BYN").text).toBe(
      "Аня добавил(а) «Пятёрочка» · 45 Br"
    );
  });

  it("повторяющаяся трата — без автора", () => {
    const l = describeActivity(act("expense.created", { description: "Аренда", amountCents: 60000, recurring: true }, null), nameOf, "BYN");
    expect(l.emoji).toBe("🔁");
    expect(l.text).toContain("Повторяющаяся трата «Аренда»");
  });

  it("правка суммы и плательщика показывает было → стало", () => {
    const l = describeActivity(
      act("expense.updated", {
        description: "Такси",
        changes: [
          { field: "amountCents", from: 3000, to: 4500 },
          { field: "paidById", from: "a", to: "b" },
          { field: "split", from: null, to: null },
        ],
      }),
      nameOf,
      "BYN"
    );
    expect(l.text).toBe("Аня изменил(а) «Такси»: сумма 30 Br → 45 Br, платил(а) Аня → Борис, деление");
  });

  it("перевод между участниками", () => {
    expect(describeActivity(act("payment.created", { fromId: "b", toId: "a", amountCents: 2000 }), nameOf, "USD").text).toBe(
      "Аня записал(а) перевод: Борис → Аня · 20 $"
    );
  });

  it("неизвестный тип не падает", () => {
    expect(describeActivity(act("future.thing", {}), nameOf, "USD").text).toBe("Событие в группе");
  });

  it("битые данные не роняют рендер", () => {
    expect(describeActivity(act("expense.updated", { changes: "oops" }), nameOf, "USD").text).toContain("изменил(а)");
  });

  it("изменение исходной валюты читается по-человечески", () => {
    const l = describeActivity(
      act("expense.updated", { description: "Аренда", changes: [{ field: "original", from: "USD:50000", to: null }] }),
      nameOf,
      "BYN"
    );
    expect(l.text).toBe("Аня изменил(а) «Аренда»: исходная сумма 500\u00a0$ → в валюте группы");
  });

  it("перевод за трату называет её", () => {
    expect(describeActivity(act("payment.created", { fromId: "b", toId: "a", amountCents: 2000, description: "Интернет" }), nameOf, "USD").text).toBe(
      "Аня записал(а) перевод: Борис → Аня · 20\u00a0$ за «Интернет»"
    );
  });
});
