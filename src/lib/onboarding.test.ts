import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TAB_TOURS,
  TOUR_STEPS,
  clearSeenTabTours,
  readLocalTourDone,
  readSeenTabTours,
  writeLocalTourDone,
  writeSeenTabTour,
} from "./onboarding";

// Валидные ключи вкладок — дублируем список здесь сознательно: тест ловит дрейф,
// если в trip-store появится/переименуется вкладка, а обучалка за ней не уследила
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

describe("TOUR_STEPS (welcome-тур)", () => {
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

describe("TAB_TOURS (обучалки вкладок)", () => {
  it("вкладки существуют, не дублируются и их немного (самое важное)", () => {
    const tabs = TAB_TOURS.map((t) => t.tab);
    expect(new Set(tabs).size).toBe(tabs.length);
    for (const t of TAB_TOURS) expect(TRIP_TAB_KEYS).toContain(t.tab);
    expect(TAB_TOURS.length).toBeLessThanOrEqual(8);
  });

  it("у каждой обучалки 2–5 шагов, у шагов уникальные id, непустые тексты и известная иконка", () => {
    const allIds: string[] = [];
    for (const t of TAB_TOURS) {
      expect(t.eyebrow.trim()).not.toBe("");
      expect(t.steps.length).toBeGreaterThanOrEqual(2);
      // 5 — потолок, достигнут только туром «Маршрут» (самый насыщенный таб:
      // планер с механикой якоря заслужил отдельный шаг); другим вкладкам теснее
      expect(t.steps.length).toBeLessThanOrEqual(5);
      for (const s of t.steps) {
        allIds.push(s.id);
        expect(s.title.trim()).not.toBe("");
        expect(s.text.trim()).not.toBe("");
      }
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("ключевые фичи из ТЗ покрыты обучалками", () => {
    const tabs = TAB_TOURS.map((t) => t.tab);
    for (const tab of ["itinerary", "map", "budget", "rest", "phrases", "timeline", "dashboard"]) {
      expect(tabs).toContain(tab);
    }
    // дни от даты старта, цветные линии, долги, «Рядом», языковой пакет, владелец
    const allText = TAB_TOURS.flatMap((t) => t.steps.map((s) => s.text)).join(" ");
    expect(allText).toContain("дата старта");
    expect(allText).toContain("цвет дня");
    expect(allText).toContain("Расчёт между друзьями");
    expect(allText).toContain("Рядом");
    expect(allText).toContain("настройках речи");
    expect(allText).toContain("передать владение");
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

describe("показанные обучалки вкладок", () => {
  it("без window — null (не читано), без записи — пустой список", () => {
    vi.unstubAllGlobals();
    expect(readSeenTabTours("u1")).toBeNull();
    stubLocalStorage();
    expect(readSeenTabTours("u1")).toEqual([]);
  });

  it("битый JSON и не-строки не роняют чтение", () => {
    window.localStorage.setItem("triptrek-tabtour-seen:u1", "{oops");
    expect(readSeenTabTours("u1")).toEqual([]);
    window.localStorage.setItem("triptrek-tabtour-seen:u1", JSON.stringify(["map", 42, null, "budget"]));
    expect(readSeenTabTours("u1")).toEqual(["map", "budget"]);
  });

  it("writeSeenTabTour добавляет с дедупликацией и персистит", () => {
    expect(writeSeenTabTour("u1", "map")).toEqual(["map"]);
    expect(writeSeenTabTour("u1", "map")).toEqual(["map"]);
    expect(writeSeenTabTour("u1", "budget")).toEqual(["map", "budget"]);
    expect(readSeenTabTours("u1")).toEqual(["map", "budget"]);
    expect(writeSeenTabTour("u2", "map")).toEqual(["map"]); // ключи по пользователям
  });

  it("clearSeenTabTours стирает список («пройти заново»)", () => {
    writeSeenTabTour("u1", "map");
    clearSeenTabTours("u1");
    expect(readSeenTabTours("u1")).toEqual([]);
  });
});
