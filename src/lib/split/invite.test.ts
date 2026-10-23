import { describe, it, expect } from "vitest";
import { normalizeInviteCode } from "./invite";
import { generateInviteCode, INVITE_ALPHABET, INVITE_CODE_LENGTH } from "./invite-server";

describe("invite codes", () => {
  it("сгенерированный код: нужной длины, только однозначные символы", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateInviteCode();
      expect(c).toHaveLength(INVITE_CODE_LENGTH);
      expect([...c].every((ch) => INVITE_ALPHABET.includes(ch))).toBe(true);
    }
    expect(INVITE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("коды не повторяются на выборке", () => {
    const set = new Set(Array.from({ length: 500 }, generateInviteCode));
    expect(set.size).toBe(500);
  });

  it("нормализация: регистр, пробелы, дефисы, кириллические двойники", () => {
    expect(normalizeInviteCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normalizeInviteCode("АВСЕ 2345")).toBe("ABCE2345"); // кириллические А В С Е
    expect(normalizeInviteCode("x".repeat(100))).toHaveLength(64);
  });
});
