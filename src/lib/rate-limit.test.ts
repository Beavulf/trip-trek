import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limit, rateLimitBlocked, rateLimitRecord, rateLimitReset } from "./rate-limit";

const WINDOW = 15 * 60_000;

describe("лимит «только неудач» (rateLimitBlocked / Record / Reset)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("проверка не двигает счётчик: сколько ни проверяй — не заблокирует", () => {
    for (let i = 0; i < 50; i++) expect(rateLimitBlocked("t1", 3, WINDOW)).toBeNull();
  });

  it("блокирует, когда записано max неудач, и отдаёт 429 с Retry-After", async () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimitBlocked("t2", 3, WINDOW)).toBeNull();
      rateLimitRecord("t2", WINDOW);
    }
    const res = rateLimitBlocked("t2", 3, WINDOW);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe(String(WINDOW / 1000));
  });

  it("Retry-After уменьшается по ходу окна", () => {
    for (let i = 0; i < 3; i++) rateLimitRecord("t3", WINDOW);
    vi.advanceTimersByTime(5 * 60_000);
    expect(rateLimitBlocked("t3", 3, WINDOW)?.headers.get("Retry-After")).toBe(String(10 * 60));
  });

  it("окно истекает — снова можно", () => {
    for (let i = 0; i < 3; i++) rateLimitRecord("t4", WINDOW);
    expect(rateLimitBlocked("t4", 3, WINDOW)).not.toBeNull();
    vi.advanceTimersByTime(WINDOW + 1);
    expect(rateLimitBlocked("t4", 3, WINDOW)).toBeNull();
  });

  it("успешный вход (reset) обнуляет неудачи", () => {
    for (let i = 0; i < 3; i++) rateLimitRecord("t5", WINDOW);
    rateLimitReset("t5");
    expect(rateLimitBlocked("t5", 3, WINDOW)).toBeNull();
  });

  it("ключи независимы: неудачи одного email не блокируют другой", () => {
    for (let i = 0; i < 3; i++) rateLimitRecord("login-fail:a@x.io", WINDOW);
    expect(rateLimitBlocked("login-fail:a@x.io", 3, WINDOW)).not.toBeNull();
    expect(rateLimitBlocked("login-fail:b@x.io", 3, WINDOW)).toBeNull();
  });
});

describe("limit — прежнее поведение не сломано", () => {
  it("считает каждый вызов и режет сверх max", () => {
    expect(limit("legacy", { max: 2, windowMs: 1000 }).ok).toBe(true);
    expect(limit("legacy", { max: 2, windowMs: 1000 }).ok).toBe(true);
    expect(limit("legacy", { max: 2, windowMs: 1000 }).ok).toBe(false);
  });
});
