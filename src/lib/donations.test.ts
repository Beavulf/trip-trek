import { describe, expect, it } from "vitest";
import {
  extractEmails,
  formatDonationLine,
  matchDonationToUser,
  normalizeEmail,
  parseDonationEvent,
} from "./donations";

const USERS = [
  { id: "u-leha", email: "leha@triptrek.com" },
  { id: "u-you", email: "you@triptrek.com" },
  { id: "u-den", email: "den@triptrek.com" },
];

describe("parseDonationEvent", () => {
  it("полный payload разбирается целиком", () => {
    const d = parseDonationEvent({
      id: "12345",
      name: "Leha",
      username: "leha_da",
      message: "на сервер :)",
      amount: 300,
      currency: "RUB",
      created_at: "2026-11-01T19:00:00.000Z",
    });
    expect(d).toMatchObject({
      externalId: "12345",
      donaterName: "Leha",
      daUsername: "leha_da",
      message: "на сервер :)",
      amountCents: 30000,
      currency: "RUB",
    });
    expect(d?.donatedAt.toISOString()).toBe("2026-11-01T19:00:00.000Z");
  });

  it("числовой id приводится к строке, строковая сумма с запятой парсится", () => {
    expect(parseDonationEvent({ id: 987, amount: "12,5", currency: "usd" })).toMatchObject({
      externalId: "987",
      amountCents: 1250,
      currency: "USD",
    });
  });

  it("мусор и неполные payload → null", () => {
    expect(parseDonationEvent(null)).toBeNull();
    expect(parseDonationEvent("hello")).toBeNull();
    expect(parseDonationEvent({})).toBeNull();
    expect(parseDonationEvent({ id: "1" })).toBeNull(); // нет суммы
    expect(parseDonationEvent({ id: "1", amount: 0 })).toBeNull();
    expect(parseDonationEvent({ id: "1", amount: -5 })).toBeNull();
    expect(parseDonationEvent({ id: "1", amount: "abc" })).toBeNull();
    expect(parseDonationEvent({ id: "  ", amount: 10 })).toBeNull();
    expect(parseDonationEvent({ id: "1", amount: 10 ** 8 })).toBeNull(); // сверх потолка INT4
  });

  it("битая дата и нет валюты — безопасные фолбэки", () => {
    const d = parseDonationEvent({ id: "1", amount: 100 });
    expect(d).not.toBeNull();
    expect(d?.currency).toBe("RUB");
    expect(Number.isNaN(d!.donatedAt.getTime())).toBe(false);
  });

  it("дата формата DA «YYYY-MM-DD HH:MM:SS» читается как UTC, а не как время сервера", () => {
    const d = parseDonationEvent({ id: "1", amount: 100, created_at: "2025-04-12 07:15:49" });
    expect(d?.donatedAt.toISOString()).toBe("2025-04-12T07:15:49.000Z");
  });
});

describe("normalizeEmail / extractEmails", () => {
  it("email нормализуется: регистр и края", () => {
    expect(normalizeEmail("  Leha@TripTrek.COM ")).toBe("leha@triptrek.com");
  });

  it("из сообщения достаются адреса без дублей, в нижнем регистре", () => {
    expect(extractEmails("для leha@triptrek.com и LEHA@TRIPTREK.COM!")).toEqual(["leha@triptrek.com"]);
    expect(extractEmails("писал на you+trip@triptrek.com с плюсом")).toEqual(["you+trip@triptrek.com"]);
    expect(extractEmails("без почты, только @ники")).toEqual([]);
    expect(extractEmails("обрезанный@нет-домена")).toEqual([]);
  });
});

describe("matchDonationToUser", () => {
  it("email из сообщения связывает с юзером — даже если имя другое", () => {
    expect(
      matchDonationToUser({ donaterName: "Аноним", message: "это den@triptrek.com, привет" }, USERS),
    ).toBe("u-den");
  });

  it("имя донатера связывает, только если оно само email (без учёта регистра)", () => {
    expect(matchDonationToUser({ donaterName: "Leha@Triptrek.com", message: null }, USERS)).toBe("u-leha");
  });

  it("обычное имя больше НЕ связывает: User.name неуникален, риск ложной привязки", () => {
    expect(matchDonationToUser({ donaterName: "Leha", message: null }, USERS)).toBeNull();
    expect(matchDonationToUser({ donaterName: "настя", message: "спасибо за @ники" }, USERS)).toBeNull();
  });

  it("пустой вход или пустой список юзеров — null", () => {
    expect(matchDonationToUser({ donaterName: null, message: null }, USERS)).toBeNull();
    expect(matchDonationToUser({ donaterName: "leha@triptrek.com", message: null }, [])).toBeNull();
  });
});

describe("formatDonationLine", () => {
  it("имя, сумма и сообщение одной строкой", () => {
    expect(
      formatDonationLine({ donaterName: "Leha", amountCents: 30000, currency: "RUB", message: "на сервер" }),
    ).toContain("Leha");
    expect(
      formatDonationLine({ donaterName: "Leha", amountCents: 30000, currency: "RUB", message: "на сервер" }),
    ).toContain("на сервер");
  });

  it("без имени — Аноним", () => {
    expect(
      formatDonationLine({ donaterName: null, amountCents: 5000, currency: "RUB", message: null }),
    ).toContain("Аноним");
  });
});
