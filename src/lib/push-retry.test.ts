import { describe, it, expect } from "vitest";
import { shouldRetryPush, PUSH_RETRY_DELAY_MS } from "./push-retry";

describe("shouldRetryPush", () => {
  it("сеть/таймаут (нет statusCode) — транзиентная, ретраим", () => {
    expect(shouldRetryPush(undefined)).toBe(true);
  });

  it("429 и 5xx — транзиентные", () => {
    expect(shouldRetryPush(429)).toBe(true);
    expect(shouldRetryPush(500)).toBe(true);
    expect(shouldRetryPush(502)).toBe(true);
    expect(shouldRetryPush(503)).toBe(true);
  });

  it("прочие 4xx — постоянные, ретрай бессмысленен", () => {
    expect(shouldRetryPush(400)).toBe(false);
    expect(shouldRetryPush(401)).toBe(false);
    expect(shouldRetryPush(403)).toBe(false);
    expect(shouldRetryPush(404)).toBe(false);
    expect(shouldRetryPush(410)).toBe(false);
  });

  it("пауза ретрая в разумных пределах (не мгновение и не вечность)", () => {
    expect(PUSH_RETRY_DELAY_MS).toBeGreaterThanOrEqual(500);
    expect(PUSH_RETRY_DELAY_MS).toBeLessThanOrEqual(5000);
  });
});
