import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TAB_HINTS,
  TOUR_STEPS,
  clearSeenHints,
  readLocalTourDone,
  readSeenHints,
  writeLocalTourDone,
  writeSeenHint,
} from "./onboarding";

// Валидные ключи вкладок — дублируем список здесь сознательно: тест ловит дрейф,
// если в trip-store появится/переименуется вкладка, а подсказка за ней не уследила
const TRIP_TAB_KEYS = [
  "dashboard",
  "timeline",
  "itinerary",
  "map",
  "gallery",
  "budget",
  "rest",
  "journal",
  "ai",
  "food",
  "phrases",
  "weather",
  "transport",
  "board",
  "achievements",
  "info",
];

function stubLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("window", { localStorage: ls });
  return store;
}

beforeEach(() => {
  stubLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TOUR_STEPS", () => {
  it("компактен: ровно 5 шагов по одной мысли", () => {
    expect(TOUR_STEPS).toHaveLength(5);
  });

  it("id уникальны, тексты непустые, art из известного набора", () => {
    const arts = ["welcome", "tabs", "quickadd", "invite", "done"];
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOUR_STEPS) {
      expect(s.title.trim()).not.toBe("");
      expect(s.text.trim()).not.toBe("");
      expect(arts).toContain(s.art);
    }
  });

  it("последний шаг — финал со своей кнопкой", () => {
    const last = TOUR_STEPS[TOUR_STEPS.length - 1];
    expect(last.id).toBe("done");
    expect(last.cta).toBeTruthy();
  });
});

describe("TAB_HINTS", () => {
  it("id и вкладки уникальны, вкладки существуют, тексты непустые", () => {
    const ids = TAB_HINTS.map((h) => h.id);
    const tabs = TAB_HINTS.map((h) => h.tab);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(tabs).size).toBe(tabs.length);
    for (const h of TAB_HINTS) {
      expect(TRIP_TAB_KEYS).toContain(h.tab);
      expect(h.title.trim()).not.toBe("");
      expect(h.text.trim()).not.toBe("");
    }
  });

  it("подсказки только на сложных вкладках — их немного", () => {
    expect(TAB_HINTS.length).toBeLessThanOrEqual(5);
  });
});

describe("локальная тень тура", () => {
  it("без window (SSR/node) — не падает, тур не пройден", () => {
    vi.unstubAllGlobals();
    expect(readLocalTourDone("u1")).toBe(false);
    expect(() => writeLocalTourDone("u1", true)).not.toThrow();
  });

  it("без userId — no-op", () => {
    expect(readLocalTourDone(null)).toBe(false);
    expect(() => writeLocalTourDone(undefined, true)).not.toThrow();
  });

  it("пишет и снимает отметку по пользователю", () => {
    writeLocalTourDone("u1", true);
    expect(readLocalTourDone("u1")).toBe(true);
    expect(readLocalTourDone("u2")).toBe(false); // не перетекает между аккаунтами
    writeLocalTourDone("u1", false);
    expect(readLocalTourDone("u1")).toBe(false);
  });
});

describe("просмотренные подсказки", () => {
  it("без window — null (не гидрировано), без записи — пустой список", () => {
    vi.unstubAllGlobals();
    expect(readSeenHints("u1")).toBeNull();
    stubLocalStorage();
    expect(readSeenHints("u1")).toEqual([]);
  });

  it("битый JSON и не-строки не роняют чтение", () => {
    window.localStorage.setItem("triptrek-hints-seen:u1", "{oops");
    expect(readSeenHints("u1")).toEqual([]);
    window.localStorage.setItem("triptrek-hints-seen:u1", JSON.stringify(["a", 42, null, "b"]));
    expect(readSeenHints("u1")).toEqual(["a", "b"]);
  });

  it("writeSeenHint добавляет с дедупликацией и персистит", () => {
    expect(writeSeenHint("u1", "map")).toEqual(["map"]);
    expect(writeSeenHint("u1", "map")).toEqual(["map"]);
    expect(writeSeenHint("u1", "budget")).toEqual(["map", "budget"]);
    expect(readSeenHints("u1")).toEqual(["map", "budget"]);
    expect(writeSeenHint("u2", "map")).toEqual(["map"]); // ключи по пользователям
  });

  it("clearSeenHints стирает список («пройти заново»)", () => {
    writeSeenHint("u1", "map");
    clearSeenHints("u1");
    expect(readSeenHints("u1")).toEqual([]);
  });
});
