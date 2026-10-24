import { describe, expect, it } from "vitest";
import {
  dueAutoReminders,
  inAutoRemindWindow,
  isRemindAfterDays,
  manualCooldownLeft,
  MANUAL_COOLDOWN_MS,
  reminderMessage,
  reminderNotification,
  agoLabel,
  type StampedExpense,
  type StampedPayment,
} from "./reminders";

const NOW = new Date("2026-10-24T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

// Аня заплатила 3000 за всех троих: Боб и Вика должны ей по 1000
const expense = (createdAt: Date, cents = 3000): StampedExpense => ({
  amountCents: cents,
  paidById: "anya",
  shares: [
    { memberId: "anya", cents: cents / 3 },
    { memberId: "bob", cents: cents / 3 },
    { memberId: "vika", cents: cents / 3 },
  ],
  createdAt,
});

const base = { payments: [] as StampedPayment[], reminders: [], afterDays: 7, now: NOW, canNotify: () => true };

describe("dueAutoReminders", () => {
  it("напоминает о долге старше срока обоим должникам", () => {
    const due = dueAutoReminders({ ...base, expenses: [expense(daysAgo(10))] });
    expect(due.map((d) => d.fromId).sort()).toEqual(["bob", "vika"]);
    expect(due.every((d) => d.toId === "anya" && d.cents === 1000)).toBe(true);
  });

  it("свежий долг не трогает", () => {
    expect(dueAutoReminders({ ...base, expenses: [expense(daysAgo(2))] })).toEqual([]);
  });

  it("старая трата + новая: сумма только за старую часть", () => {
    const due = dueAutoReminders({ ...base, expenses: [expense(daysAgo(10)), expense(daysAgo(1), 6000)] });
    expect(due.find((d) => d.fromId === "bob")?.cents).toBe(1000);
  });

  it("частичный возврат уменьшает сумму напоминания", () => {
    const due = dueAutoReminders({
      ...base,
      expenses: [expense(daysAgo(10))],
      payments: [{ fromId: "bob", toId: "anya", amountCents: 400, createdAt: daysAgo(1) }],
    });
    expect(due.find((d) => d.fromId === "bob")?.cents).toBe(600);
  });

  it("закрытый долг не напоминает", () => {
    const due = dueAutoReminders({
      ...base,
      expenses: [expense(daysAgo(10))],
      payments: [{ fromId: "bob", toId: "anya", amountCents: 1000, createdAt: daysAgo(5) }],
    });
    expect(due.map((d) => d.fromId)).toEqual(["vika"]);
  });

  it("не повторяет, пока не прошёл срок с последнего напоминания (в т.ч. ручного)", () => {
    const recent = { fromId: "bob", toId: "anya", createdAt: daysAgo(3) };
    const due = dueAutoReminders({ ...base, expenses: [expense(daysAgo(20))], reminders: [recent] });
    expect(due.map((d) => d.fromId)).toEqual(["vika"]);
    const old = { fromId: "bob", toId: "anya", createdAt: daysAgo(8) };
    expect(dueAutoReminders({ ...base, expenses: [expense(daysAgo(20))], reminders: [old] }).map((d) => d.fromId).sort()).toEqual(["bob", "vika"]);
  });

  it("пропускает тех, кому нельзя отправить (нет аккаунта / вышел)", () => {
    const due = dueAutoReminders({ ...base, expenses: [expense(daysAgo(10))], canNotify: (id) => id !== "bob" });
    expect(due.map((d) => d.fromId)).toEqual(["vika"]);
  });

  it("копеечные долги игнорирует", () => {
    expect(dueAutoReminders({ ...base, expenses: [expense(daysAgo(10), 150)] })).toEqual([]);
  });

  it("встречные долги нетто: напоминает только тому, кто должен в итоге", () => {
    const back: StampedExpense = {
      amountCents: 1500,
      paidById: "bob",
      shares: [{ memberId: "anya", cents: 1500 }],
      createdAt: daysAgo(9),
    };
    const due = dueAutoReminders({ ...base, expenses: [expense(daysAgo(10)), back] });
    // bob должен Ане 1000, Аня ему 1500 → в итоге Аня должна Бобу 500
    expect(due.find((d) => d.fromId === "bob")).toBeUndefined();
    expect(due.find((d) => d.fromId === "anya" && d.toId === "bob")?.cents).toBe(500);
  });
});

describe("manualCooldownLeft", () => {
  it("без прошлых напоминаний — можно сразу", () => {
    expect(manualCooldownLeft(null, NOW)).toBe(0);
  });
  it("внутри 12 часов — остаток, после — 0", () => {
    expect(manualCooldownLeft(new Date(NOW.getTime() - 3_600_000), NOW)).toBe(MANUAL_COOLDOWN_MS - 3_600_000);
    expect(manualCooldownLeft(new Date(NOW.getTime() - MANUAL_COOLDOWN_MS - 1), NOW)).toBe(0);
  });
});

describe("окно и допустимые сроки", () => {
  it("шлём только днём по Минску (06–18 UTC)", () => {
    expect(inAutoRemindWindow(new Date("2026-10-24T05:59:00Z"))).toBe(false);
    expect(inAutoRemindWindow(new Date("2026-10-24T06:00:00Z"))).toBe(true);
    expect(inAutoRemindWindow(new Date("2026-10-24T17:59:00Z"))).toBe(true);
    expect(inAutoRemindWindow(new Date("2026-10-24T18:00:00Z"))).toBe(false);
  });
  it("допустимые сроки — 3, 7, 14", () => {
    expect([3, 7, 14].every(isRemindAfterDays)).toBe(true);
    expect(isRemindAfterDays(5)).toBe(false);
    expect(isRemindAfterDays(null)).toBe(false);
  });
});

describe("тексты", () => {
  it("уведомление различает ручное и автоматическое и не содержит реквизитов", () => {
    const manual = reminderNotification({ kind: "manual", creditorName: "Аня", groupName: "Квартира", cents: 2300, currency: "BYN" });
    expect(manual.title).toContain("Аня напоминает");
    const auto = reminderNotification({ kind: "auto", creditorName: "Аня", groupName: "Квартира", cents: 2300, currency: "BYN" });
    expect(auto.title).toMatch(/^Напоминание/);
    expect(manual.body).toContain("Квартира");
  });
  it("сообщение для должника без аккаунта: реквизиты — только если есть", () => {
    const withReq = reminderMessage({ debtorName: "Лёха", groupName: "Квартира", cents: 2300, currency: "BYN", requisites: " 5375 … " });
    expect(withReq).toContain("Куда: 5375 …");
    expect(reminderMessage({ debtorName: "Лёха", groupName: "Квартира", cents: 2300, currency: "BYN" })).not.toContain("Куда");
  });
  it("agoLabel", () => {
    expect(agoLabel(new Date(NOW.getTime() - 20_000), NOW)).toBe("только что");
    expect(agoLabel(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe("5 мин назад");
    expect(agoLabel(new Date(NOW.getTime() - 3 * 3_600_000), NOW)).toBe("3 ч назад");
    expect(agoLabel(new Date(NOW.getTime() - 50 * 3_600_000), NOW)).toBe("2 дн назад");
  });
});
