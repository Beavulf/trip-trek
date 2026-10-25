import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_ONBOARDING_STATE,
  ONBOARDING_CONTENT_VERSION,
  applyPatch,
  clearLegacyLocalState,
  isSnoozed,
  isTourFinished,
  mergeStates,
  readLegacyLocalState,
  readLocalState,
  sanitizePatch,
  sanitizeState,
  writeLocalState,
  type OnboardingState,
} from "./onboarding-state";

const T0 = new Date("2026-10-25T10:00:00.000Z");
const iso = (min: number) => new Date(T0.getTime() + min * 60_000).toISOString();

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

beforeEach(() => void stubLocalStorage());
afterEach(() => vi.unstubAllGlobals());

describe("sanitizeState", () => {
  it("мусор → пустое состояние, а не исключение", () => {
    for (const raw of [null, undefined, 5, "x", [], { tours: 7 }]) {
      expect(sanitizeState(raw)).toEqual(EMPTY_ONBOARDING_STATE);
    }
  });

  it("оставляет валидные туры и выбрасывает битые", () => {
    const s = sanitizeState({
      tours: {
        map: { status: "done", step: 2, at: iso(0) },
        "BAD ID": { status: "done", step: 0, at: iso(0) },
        budget: { status: "weird", step: 0, at: iso(0) },
        rest: { status: "paused", step: 99999, at: "not a date" },
        food: { status: "later", step: -4, at: iso(1) },
      },
      hintsOff: "yes",
      seenVersion: 3.9,
    });
    expect(Object.keys(s.tours).sort()).toEqual(["food", "map"]);
    expect(s.tours.food.step).toBe(0); // отрицательный шаг прижат к нулю
    expect(s.hintsOff).toBe(false); // только настоящий true
    expect(s.seenVersion).toBe(3);
  });

  it("не принимает больше 64 туров", () => {
    const tours: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) tours[`t${i}`] = { status: "done", step: 0, at: iso(i) };
    expect(Object.keys(sanitizeState({ tours }).tours)).toHaveLength(64);
  });
});

describe("sanitizePatch", () => {
  it("пустое и не-объект → null", () => {
    expect(sanitizePatch(null)).toBeNull();
    expect(sanitizePatch({})).toBeNull();
    expect(sanitizePatch({ tours: {} })).toBeNull();
    expect(sanitizePatch([])).toBeNull();
  });

  it("пропускает только известные поля нужных типов", () => {
    const p = sanitizePatch({
      tours: { map: { status: "done", step: 1, at: iso(0) }, bad: { status: "x" }, gone: null },
      hintsOff: true,
      checklistHidden: "no",
      snoozedUntil: iso(30),
      evil: "<script>",
      reset: true,
    });
    expect(p).toEqual({
      tours: { map: { status: "done", step: 1, at: iso(0) }, gone: null },
      hintsOff: true,
      snoozedUntil: iso(30),
      reset: true,
    });
  });

  it("snoozedUntil: null снимает паузу, мусор игнорируется", () => {
    expect(sanitizePatch({ snoozedUntil: null })).toEqual({ snoozedUntil: null });
    expect(sanitizePatch({ snoozedUntil: "завтра" })).toBeNull();
  });
});

describe("applyPatch", () => {
  const done = { status: "done", step: 0, at: iso(1) } as const;

  it("добавляет и убирает записи туров, обновляет updatedAt", () => {
    const a = applyPatch(EMPTY_ONBOARDING_STATE, { tours: { map: done } }, T0);
    expect(isTourFinished(a, "map")).toBe(true);
    expect(a.updatedAt).toBe(T0.toISOString());
    const b = applyPatch(a, { tours: { map: null } }, T0);
    expect(b.tours.map).toBeUndefined();
  });

  it("не мутирует исходное состояние", () => {
    const a = applyPatch(EMPTY_ONBOARDING_STATE, { tours: { map: done } }, T0);
    const snapshot = JSON.stringify(a);
    applyPatch(a, { tours: { budget: done }, hintsOff: true }, T0);
    expect(JSON.stringify(a)).toBe(snapshot);
    expect(EMPTY_ONBOARDING_STATE.tours).toEqual({});
  });

  it("seenVersion только растёт", () => {
    const a = applyPatch(EMPTY_ONBOARDING_STATE, { seenVersion: 5 }, T0);
    expect(applyPatch(a, { seenVersion: 2 }, T0).seenVersion).toBe(5);
  });

  it("reset обнуляет всё, ставит resetAt и не показывает «Что нового»", () => {
    let s = applyPatch(EMPTY_ONBOARDING_STATE, { tours: { map: done }, hintsOff: true, checklistHidden: true, snoozedUntil: iso(500) }, T0);
    s = applyPatch(s, { reset: true }, T0);
    expect(s.tours).toEqual({});
    expect(s.hintsOff).toBe(false);
    expect(s.checklistHidden).toBe(false);
    expect(s.snoozedUntil).toBeNull();
    expect(s.resetAt).toBe(T0.toISOString());
    expect(s.seenVersion).toBe(ONBOARDING_CONTENT_VERSION);
  });

  it("при переполнении оставляет самые свежие туры", () => {
    let s: OnboardingState = EMPTY_ONBOARDING_STATE;
    for (let i = 0; i < 70; i++) s = applyPatch(s, { tours: { [`t${i}`]: { status: "done", step: 0, at: iso(i) } } }, T0);
    expect(Object.keys(s.tours)).toHaveLength(64);
    expect(s.tours.t0).toBeUndefined();
    expect(s.tours.t69).toBeDefined();
  });
});

describe("mergeStates", () => {
  it("по туру побеждает более поздняя запись", () => {
    const a = applyPatch(EMPTY_ONBOARDING_STATE, { tours: { map: { status: "paused", step: 1, at: iso(1) } } }, T0);
    const b = applyPatch(EMPTY_ONBOARDING_STATE, { tours: { map: { status: "done", step: 0, at: iso(5) } } }, T0);
    expect(mergeStates(a, b).tours.map.status).toBe("done");
    expect(mergeStates(b, a).tours.map.status).toBe("done");
  });

  it("записи старше сброса отбрасываются — копия устройства не воскрешает пройденное", () => {
    const device = applyPatch(EMPTY_ONBOARDING_STATE, { tours: { map: { status: "done", step: 0, at: iso(1) } } }, T0);
    const account = applyPatch(device, { reset: true }, new Date(iso(10)));
    expect(mergeStates(account, device).tours).toEqual({});
    expect(mergeStates(device, account).tours).toEqual({});
  });

  it("запись после сброса переживает слияние", () => {
    const account = applyPatch(EMPTY_ONBOARDING_STATE, { reset: true }, new Date(iso(10)));
    const device = applyPatch(account, { tours: { map: { status: "done", step: 0, at: iso(20) } } }, new Date(iso(20)));
    expect(mergeStates(account, device).tours.map.status).toBe("done");
  });

  it("скаляры берутся из копии, изменённой позже", () => {
    const old = applyPatch(EMPTY_ONBOARDING_STATE, { hintsOff: true }, new Date(iso(1)));
    const fresh = applyPatch(old, { hintsOff: false }, new Date(iso(9)));
    expect(mergeStates(old, fresh).hintsOff).toBe(false);
    expect(mergeStates(fresh, old).hintsOff).toBe(false);
  });
});

describe("пауза", () => {
  it("isSnoozed учитывает время", () => {
    const s = applyPatch(EMPTY_ONBOARDING_STATE, { snoozedUntil: iso(60) }, T0);
    expect(isSnoozed(s, T0.getTime())).toBe(true);
    expect(isSnoozed(s, T0.getTime() + 61 * 60_000)).toBe(false);
    expect(isSnoozed(EMPTY_ONBOARDING_STATE, T0.getTime())).toBe(false);
  });
});

describe("локальная копия устройства", () => {
  it("без window не падает", () => {
    vi.unstubAllGlobals();
    expect(readLocalState("u1")).toBeNull();
    expect(() => writeLocalState("u1", EMPTY_ONBOARDING_STATE)).not.toThrow();
    expect(readLegacyLocalState("u1")).toBeNull();
  });

  it("пишет и читает по пользователю", () => {
    const s = applyPatch(EMPTY_ONBOARDING_STATE, { hintsOff: true }, T0);
    writeLocalState("u1", s);
    expect(readLocalState("u1")?.hintsOff).toBe(true);
    expect(readLocalState("u2")).toBeNull();
  });

  it("битый JSON → null", () => {
    window.localStorage.setItem("triptrek-onboarding:u1", "{oops");
    expect(readLocalState("u1")).toBeNull();
  });

  it("старые отметки превращаются в туры и чистятся", () => {
    window.localStorage.setItem("triptrek-tabtour-seen:u1", JSON.stringify(["map", 42, "budget"]));
    window.localStorage.setItem("triptrek-tour-local-done:u1", "1");
    const s = readLegacyLocalState("u1")!;
    expect(Object.keys(s.tours).sort()).toEqual(["budget", "map", "welcome"]);
    expect(isTourFinished(s, "welcome")).toBe(true);
    clearLegacyLocalState("u1");
    expect(readLegacyLocalState("u1")).toBeNull();
  });

  it("старые отметки не перекрывают более позднюю запись и сброс", () => {
    window.localStorage.setItem("triptrek-tabtour-seen:u1", JSON.stringify(["map"]));
    const legacy = readLegacyLocalState("u1")!;
    const account = applyPatch(EMPTY_ONBOARDING_STATE, { reset: true }, T0);
    expect(mergeStates(account, legacy).tours).toEqual({});
  });
});
