import { describe, expect, it } from "vitest";
import { activeShareWhere, isShareExpired, parseExpiryDays, shareExpiryFromDays } from "./public-share";

const now = new Date("2026-10-25T12:00:00.000Z");

describe("срок публичной ссылки", () => {
  it("null — бессрочно, в будущем — действует, на границе и позже — истекла", () => {
    expect(isShareExpired(null, now)).toBe(false);
    expect(isShareExpired(undefined, now)).toBe(false);
    expect(isShareExpired(new Date("2026-10-25T12:00:01.000Z"), now)).toBe(false);
    expect(isShareExpired(new Date("2026-10-25T12:00:00.000Z"), now)).toBe(true);
    expect(isShareExpired(new Date("2026-10-01T00:00:00.000Z"), now)).toBe(true);
  });

  it("срок в сутках считается от момента выбора", () => {
    expect(shareExpiryFromDays(7, now).toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });

  it("разбор тела: только значения из списка и null", () => {
    expect(parseExpiryDays(7)).toBe(7);
    expect(parseExpiryDays(90)).toBe(90);
    expect(parseExpiryDays(null)).toBeNull();
    expect(parseExpiryDays(5)).toBeUndefined();
    expect(parseExpiryDays(-1)).toBeUndefined();
    expect(parseExpiryDays("7")).toBeUndefined();
    expect(parseExpiryDays(undefined)).toBeUndefined();
  });

  it("условие поиска: токен + включена + (без срока или срок впереди)", () => {
    expect(activeShareWhere("tok", now)).toEqual({
      shareToken: "tok",
      shareEnabled: true,
      OR: [{ shareExpiresAt: null }, { shareExpiresAt: { gt: now } }],
    });
  });
});
