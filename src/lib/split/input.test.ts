import { describe, it, expect } from "vitest";
import {
  normalizeExpenseInput,
  normalizeGroupInput,
  normalizeMemberProfile,
  normalizePaymentInput,
  normalizeRecurringInput,
} from "./input";

const TODAY = "2026-10-23";
const members = new Set(["a", "b", "c"]);
const ctx = { allowedMemberIds: members, todayKey: TODAY, groupCurrency: "BYN" };

const base = {
  amountCents: 3000,
  description: "Пятёрочка",
  category: "groceries",
  paidById: "a",
  spentOn: "2026-10-22",
  splitMode: "equal",
  split: [{ memberId: "a" }, { memberId: "b" }, { memberId: "c" }],
};

describe("normalizeExpenseInput", () => {
  it("валидная трата: доли посчитаны сервером", () => {
    const r = normalizeExpenseInput(base, ctx);
    expect(r.ok && r.value.shares.map((s) => s.cents)).toEqual([1000, 1000, 1000]);
    expect(r.ok && r.value.spentOn).toBe("2026-10-22");
  });

  it("пустое описание → название категории", () => {
    const r = normalizeExpenseInput({ ...base, description: "  ", category: "cafe" }, ctx);
    expect(r.ok && r.value.description).toBe("Кафе и доставка");
  });

  it("неизвестная категория → «Прочее»", () => {
    const r = normalizeExpenseInput({ ...base, category: "casino" }, ctx);
    expect(r.ok && r.value.category).toBe("other");
  });

  it.each([
    ["сумма 0", { amountCents: 0 }],
    ["сумма дробная", { amountCents: 10.5 }],
    ["сумма строкой", { amountCents: "100" }],
    ["сумма за потолком", { amountCents: 1e9 }],
    ["плательщик чужой", { paidById: "zzz" }],
    ["в делении чужой", { split: [{ memberId: "a" }, { memberId: "zzz" }] }],
    ["пустое деление", { split: [] }],
    ["деление не массив", { split: "a,b" }],
    ["неизвестный режим", { splitMode: "weird" }],
    ["дата битая", { spentOn: "2026-02-31" }],
    ["дата далеко в будущем", { spentOn: "2026-12-01" }],
  ])("отвергает: %s", (_name, over) => {
    expect(normalizeExpenseInput({ ...base, ...over }, ctx).ok).toBe(false);
  });

  it("завтра допустимо (часовые пояса), через неделю — нет", () => {
    expect(normalizeExpenseInput({ ...base, spentOn: "2026-10-24" }, ctx).ok).toBe(true);
    expect(normalizeExpenseInput({ ...base, spentOn: "2026-10-30" }, ctx).ok).toBe(false);
  });

  it("точные суммы, не сходящиеся с суммой траты, отвергаются", () => {
    const r = normalizeExpenseInput(
      { ...base, splitMode: "exact", split: [{ memberId: "a", value: 1000 }, { memberId: "b", value: 1000 }] },
      ctx
    );
    expect(r.ok).toBe(false);
  });

  it("длинная заметка и описание обрезаются, а не роняют запрос", () => {
    const r = normalizeExpenseInput({ ...base, description: "x".repeat(900), note: "y".repeat(900) }, ctx);
    expect(r.ok && r.value.description).toHaveLength(200);
    expect(r.ok && r.value.note).toHaveLength(500);
  });
});

describe("normalizeExpenseInput: другая валюта", () => {
  it("исходная сумма и валюта сохраняются; код приводится к верхнему регистру", () => {
    const r = normalizeExpenseInput({ ...base, amountCents: 160000, original: { amountCents: 50000, currency: "usd" } }, ctx);
    expect(r.ok && r.value.original).toEqual({ amountCents: 50000, currency: "USD" });
    expect(r.ok && r.value.amountCents).toBe(160000); // долги считаются в валюте группы
  });

  it("валюта совпала с валютой группы или original не передан — original = null", () => {
    const same = normalizeExpenseInput({ ...base, original: { amountCents: 3000, currency: "BYN" } }, ctx);
    expect(same.ok && same.value.original).toBeNull();
    const none = normalizeExpenseInput(base, ctx);
    expect(none.ok && none.value.original).toBeNull();
  });

  it.each([
    ["код из двух букв", { amountCents: 100, currency: "US" }],
    ["код с цифрами", { amountCents: 100, currency: "U5D" }],
    ["нулевая сумма", { amountCents: 0, currency: "USD" }],
    ["дробная сумма", { amountCents: 10.5, currency: "USD" }],
    ["не объект", "USD"],
  ])("отвергает: %s", (_n, original) => {
    expect(normalizeExpenseInput({ ...base, original }, ctx).ok).toBe(false);
  });
});

describe("normalizePaymentInput", () => {
  const pctx = { knownMemberIds: members, todayKey: TODAY };
  const pay = { fromId: "b", toId: "a", amountCents: 1500, paidOn: TODAY, clientKey: "k1" };

  it("валидный перевод", () => {
    const r = normalizePaymentInput(pay, pctx);
    expect(r.ok && r.value).toMatchObject({ fromId: "b", toId: "a", amountCents: 1500, clientKey: "k1" });
  });

  it.each([
    ["себе", { toId: "b" }],
    ["чужой получатель", { toId: "zzz" }],
    ["нулевая сумма", { amountCents: 0 }],
    ["без дат", { paidOn: "вчера" }],
  ])("отвергает: %s", (_n, over) => {
    expect(normalizePaymentInput({ ...pay, ...over }, pctx).ok).toBe(false);
  });
});

describe("normalizeRecurringInput", () => {
  const rec = { ...base, dayOfMonth: 5, startsOn: "2026-09-01", description: "Аренда", category: "rent" };

  it("валидный шаблон хранит ввод пользователя, а не готовые доли", () => {
    const r = normalizeRecurringInput(
      { ...rec, splitMode: "percent", split: [{ memberId: "a", value: 6000 }, { memberId: "b", value: 4000 }] },
      ctx
    );
    expect(r.ok && r.value.template).toEqual([
      { memberId: "a", value: 6000 },
      { memberId: "b", value: 4000 },
    ]);
  });

  it("поровну: значения в шаблоне не хранятся", () => {
    const r = normalizeRecurringInput(rec, ctx);
    expect(r.ok && r.value.template.every((t) => t.value === null)).toBe(true);
  });

  it("шаблон в иностранной валюте хранит исходную сумму", () => {
    const r = normalizeRecurringInput({ ...rec, amountCents: 160000, original: { amountCents: 50000, currency: "USD" } }, ctx);
    expect(r.ok && r.value.original).toEqual({ amountCents: 50000, currency: "USD" });
  });

  it.each([
    ["день 0", { dayOfMonth: 0 }],
    ["день 32", { dayOfMonth: 32 }],
    ["без названия", { description: " " }],
    ["начало глубже года назад", { startsOn: "2025-01-01" }],
    ["окончание раньше начала", { endsOn: "2026-08-01" }],
  ])("отвергает: %s", (_n, over) => {
    expect(normalizeRecurringInput({ ...rec, ...over }, ctx).ok).toBe(false);
  });
});

describe("normalizeGroupInput / normalizeMemberProfile", () => {
  it("создание: имя и валюта обязательны", () => {
    expect(normalizeGroupInput({ name: "Квартира", currency: "byn" }, { partial: false })).toEqual({
      ok: true,
      value: { name: "Квартира", currency: "BYN" },
    });
    expect(normalizeGroupInput({ name: "", currency: "BYN" }, { partial: false }).ok).toBe(false);
    expect(normalizeGroupInput({ name: "X", currency: "XXX" }, { partial: false }).ok).toBe(false);
  });

  it("правка: любое подмножество; плохой цвет отвергается", () => {
    expect(normalizeGroupInput({ allowMemberInvites: false }, { partial: true })).toEqual({
      ok: true,
      value: { allowMemberInvites: false },
    });
    expect(normalizeGroupInput({ color: "red" }, { partial: true }).ok).toBe(false);
  });

  it("профиль участника: запасные значения", () => {
    expect(normalizeMemberProfile({ displayName: "Лёша" })).toEqual({
      ok: true,
      value: { displayName: "Лёша", emoji: "👤", color: "#94a3b8" },
    });
    expect(normalizeMemberProfile({ displayName: " " }).ok).toBe(false);
  });
});

describe("normalizePaymentInput: перевод за трату", () => {
  const pctx = { knownMemberIds: members, todayKey: TODAY };
  const pay = { fromId: "b", toId: "a", amountCents: 1500, paidOn: TODAY };

  it("expenseId проходит как есть, пустое — null", () => {
    const r = normalizePaymentInput({ ...pay, expenseId: "exp1" }, pctx);
    expect(r.ok && r.value.expenseId).toBe("exp1");
    const none = normalizePaymentInput({ ...pay, expenseId: "  " }, pctx);
    expect(none.ok && none.value.expenseId).toBeNull();
    const absent = normalizePaymentInput(pay, pctx);
    expect(absent.ok && absent.value.expenseId).toBeNull();
  });
});
