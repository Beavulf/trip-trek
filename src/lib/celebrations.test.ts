import { describe, expect, it } from "vitest";
import {
  debtClearSeenKey,
  debtHadKey,
  pickBadgePresentation,
  recapSeenKey,
  shouldAutoRecap,
  shouldCelebrateDebts,
  shouldCelebrateSplit,
  splitClearSeenKey,
  splitHadKey,
  type CelebratedBadge,
} from "./celebrations";

describe("ключи seen-флагов", () => {
  it("стабильны и включают id сущности с префиксом tt-", () => {
    expect(debtHadKey("t1")).toBe("tt-debts-had-t1");
    expect(debtClearSeenKey("t1")).toBe("tt-debts-clear-seen-t1");
    expect(recapSeenKey("t1")).toBe("tt-recap-seen-t1");
    expect(splitHadKey("g1")).toBe("tt-split-had-g1");
    expect(splitClearSeenKey("g1")).toBe("tt-split-clear-seen-g1");
  });
});

describe("shouldCelebrateDebts", () => {
  it("празднуем только переход «были долги → чисто» и один раз", () => {
    expect(shouldCelebrateDebts(true, false, false)).toBe(false);
    // долгов не было — нечему радоваться (пустая поездка)
    expect(shouldCelebrateDebts(false, true, false)).toBe(false);
    expect(shouldCelebrateDebts(true, true, false)).toBe(true);
    // уже праздновали
    expect(shouldCelebrateDebts(true, true, true)).toBe(false);
  });
});

describe("shouldAutoRecap", () => {
  it("авто-«Итоги»: конец, долгов нет, было что вспоминать, не показывали", () => {
    expect(shouldAutoRecap({ finished: true, hasDebts: false, hadSpending: true, seen: false })).toBe(true);
    expect(shouldAutoRecap({ finished: false, hasDebts: false, hadSpending: true, seen: false })).toBe(false);
    expect(shouldAutoRecap({ finished: true, hasDebts: true, hadSpending: true, seen: false })).toBe(false);
    // пустая поездка без трат — «итоги» пустая фраза
    expect(shouldAutoRecap({ finished: true, hasDebts: false, hadSpending: false, seen: false })).toBe(false);
    expect(shouldAutoRecap({ finished: true, hasDebts: false, hadSpending: true, seen: true })).toBe(false);
  });
});

describe("shouldCelebrateSplit", () => {
  it("требует активность, переход в ноль и непоказанный праздник", () => {
    expect(shouldCelebrateSplit(true, true, true, false)).toBe(true);
    // не было трат/переводов — «чисто» пустая фраза
    expect(shouldCelebrateSplit(true, true, false, false)).toBe(false);
    expect(shouldCelebrateSplit(false, true, true, false)).toBe(false);
    expect(shouldCelebrateSplit(true, false, true, false)).toBe(false);
    expect(shouldCelebrateSplit(true, true, true, true)).toBe(false);
  });
});

describe("pickBadgePresentation", () => {
  const badge = (id: string): CelebratedBadge => ({ id, title: id, emoji: "🏅", description: "d" });

  it("нет свежих — праздника нет", () => {
    expect(pickBadgePresentation([])).toBeNull();
  });

  it("до трёх — карточки списком, больше — счётчик", () => {
    const one = pickBadgePresentation([badge("a")]);
    const three = pickBadgePresentation([badge("a"), badge("b"), badge("c")]);
    const four = pickBadgePresentation([badge("a"), badge("b"), badge("c"), badge("d")]);
    // до трёх — карточки списком, больше — счётчик; null невозможен для непустого набора
    expect(one?.mode).toBe("list");
    expect(three?.mode).toBe("list");
    expect(four?.mode).toBe("count");
  });
});
