import { describe, it, expect } from "vitest";
import { AI_FEATURES, parseAiUsage, utcMidnight, isSpendOverLimit } from "./ai-usage";

describe("AI_FEATURES", () => {
  it("у обычных генераций лимит 10/час, у тяжёлых — жёстче", () => {
    expect(AI_FEATURES["ai-summary"].limit.max).toBe(10);
    expect(AI_FEATURES["foods-suggest"].limit.max).toBe(10);
    expect(AI_FEATURES["phrases-ai"].limit.max).toBe(10);
    // планировщик — самый дорогой по токенам; Overpass-фичи — средние
    expect(AI_FEATURES.planner.limit.max).toBe(3);
    expect(AI_FEATURES.restaurants.limit.max).toBe(6);
    expect(AI_FEATURES.walk.limit.max).toBe(6);
    for (const def of Object.values(AI_FEATURES)) {
      expect(def.limit.windowMs).toBe(60 * 60_000);
      expect(["all", "premium-or-byok"]).toContain(def.access);
    }
  });

  it("температуры фич не дрейфуют от исторических контрактов", () => {
    expect(AI_FEATURES["ai-summary"].temperature).toBe(0.9);
    expect(AI_FEATURES["foods-suggest"].temperature).toBe(0.8);
    expect(AI_FEATURES["phrases-ai"].temperature).toBe(0.7);
  });
});

describe("parseAiUsage", () => {
  it("читает стандартный usage провайдера", () => {
    expect(parseAiUsage({ usage: { prompt_tokens: 120, completion_tokens: 45 } })).toEqual({
      promptTokens: 120,
      completionTokens: 45,
    });
  });

  it("отсутствие usage — нули, не падение", () => {
    expect(parseAiUsage({ choices: [] })).toEqual({ promptTokens: 0, completionTokens: 0 });
    expect(parseAiUsage(null)).toEqual({ promptTokens: 0, completionTokens: 0 });
    expect(parseAiUsage({ usage: { prompt_tokens: "x" } })).toEqual({ promptTokens: 0, completionTokens: 0 });
  });

  it("отрицательные и дробные значения приводим к честным целым", () => {
    expect(parseAiUsage({ usage: { prompt_tokens: -5, completion_tokens: 3.9 } })).toEqual({
      promptTokens: 0,
      completionTokens: 3,
    });
  });
});

describe("utcMidnight", () => {
  it("обнуляет время, оставляя UTC-дату", () => {
    const m = utcMidnight(new Date("2026-09-13T15:47:23Z"));
    expect(m.toISOString()).toBe("2026-09-13T00:00:00.000Z");
  });

  it("23:59 UTC и 00:01 UTC — разные сутки", () => {
    expect(utcMidnight(new Date("2026-09-13T23:59:59Z")).getUTCDate()).toBe(13);
    expect(utcMidnight(new Date("2026-09-14T00:01:00Z")).getUTCDate()).toBe(14);
  });
});

describe("isSpendOverLimit", () => {
  const base = { callsToday: 0, tokensToday: 0, callsLimit: 0, tokensLimit: 0 };

  it("лимиты 0 — алерт никогда не срабатывает", () => {
    expect(isSpendOverLimit({ ...base, callsToday: 9999, tokensToday: 999999 })).toBe(false);
  });

  it("превышение по вызовам", () => {
    expect(isSpendOverLimit({ ...base, callsToday: 51, callsLimit: 50 })).toBe(true);
    expect(isSpendOverLimit({ ...base, callsToday: 50, callsLimit: 50 })).toBe(false); // ровно порог — ок
  });

  it("превышение по токенам", () => {
    expect(isSpendOverLimit({ ...base, tokensToday: 200_001, tokensLimit: 200_000 })).toBe(true);
  });

  it("оба измерения активны — достаточно одного", () => {
    expect(
      isSpendOverLimit({ callsToday: 10, tokensToday: 999_999, callsLimit: 50, tokensLimit: 500_000 })
    ).toBe(true);
  });
});
