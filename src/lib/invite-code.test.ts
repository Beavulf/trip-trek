// src/lib/invite-code.test.ts
import { describe, expect, it } from "vitest";
import { generateInviteCode, inviteCodeStatus, normalizeInviteCode } from "./invite-code";

// Алфавит без похожих символов (нет I/O/0/1) — код читают с экрана и диктуют голосом
const ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;

describe("generateInviteCode", () => {
  it("длина по умолчанию 8, только алфавит без похожих символов", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(ALPHABET);
    }
  });
  it("коды не повторяются", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));
    expect(codes.size).toBe(200);
  });
});

describe("normalizeInviteCode", () => {
  it("обрезает пробелы и поднимает регистр — как инвайт-коды поездок", () => {
    expect(normalizeInviteCode("  abcd2345 ")).toBe("ABCD2345");
  });
});

describe("inviteCodeStatus", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const base = { maxUses: 1, usedCount: 0, expiresAt: null, deactivatedAt: null };

  it("active — живой код со свободным слотом", () => {
    expect(inviteCodeStatus(base, now)).toBe("active");
  });
  it("deactivated — выключенный админом, даже если всё остальное ок", () => {
    expect(inviteCodeStatus({ ...base, deactivatedAt: now }, now)).toBe("deactivated");
  });
  it("expired — срок вышел", () => {
    expect(inviteCodeStatus({ ...base, expiresAt: new Date("2026-10-23T11:59:59Z") }, now)).toBe("expired");
  });
  it("exhausted — слоты кончились", () => {
    expect(inviteCodeStatus({ ...base, usedCount: 1, maxUses: 1 }, now)).toBe("exhausted");
  });
});
