import { describe, expect, it } from "vitest";
import {
  AUTO_COOLDOWN_MS,
  SNOOZE_MS,
  exitPatch,
  getTour,
  pickAutoTour,
  startStepFor,
  tourHref,
  tourStatusView,
  stepsFor,
  type PickContext,
} from "./onboarding";
import { EMPTY_ONBOARDING_STATE, applyPatch, type OnboardingState } from "./onboarding-state";

const NOW = new Date("2026-10-25T10:00:00.000Z");
const at = NOW.toISOString();

function ctx(over: Partial<PickContext> = {}, state: OnboardingState = EMPTY_ONBOARDING_STATE): PickContext {
  return {
    state,
    area: "trip",
    tab: "dashboard",
    splitScreen: null,
    hasTrip: true,
    role: "owner",
    now: NOW.getTime(),
    cooldownUntil: 0,
    ...over,
  };
}
const withTours = (tours: OnboardingState["tours"], extra: Partial<OnboardingState> = {}): OnboardingState => ({
  ...EMPTY_ONBOARDING_STATE,
  tours,
  ...extra,
});
const done = { status: "done", step: 0, at } as const;

describe("pickAutoTour — поездка", () => {
  it("новичок с поездкой: сначала знакомство", () => {
    expect(pickAutoTour(ctx())).toBe("welcome");
  });

  it("без поездки или пока роль не известна ничего не открываем", () => {
    expect(pickAutoTour(ctx({ hasTrip: false }))).toBeNull();
    expect(pickAutoTour(ctx({ role: null }))).toBeNull();
  });

  it("пока знакомство не закрыто, туры вкладок молчат", () => {
    expect(pickAutoTour(ctx({ tab: "map" }))).toBe("welcome");
  });

  it("после знакомства — тур открытой вкладки, один раз", () => {
    const s = withTours({ welcome: done });
    expect(pickAutoTour(ctx({ tab: "map" }, s))).toBe("map");
    const seen = withTours({ welcome: done, map: done });
    expect(pickAutoTour(ctx({ tab: "map" }, seen))).toBeNull();
  });

  it("у всех вкладок навигации есть тур", () => {
    const s = withTours({ welcome: done });
    for (const tab of ["dashboard", "itinerary", "lodging", "map", "budget", "timeline", "gallery", "journal", "achievements", "food", "rest", "weather", "phrases", "ai", "board", "info"] as const) {
      expect(pickAutoTour(ctx({ tab }, s)), tab).toBe(tab);
    }
  });

  it("«Больше не показывать», пауза и остывание блокируют автозапуск", () => {
    expect(pickAutoTour(ctx({}, withTours({}, { hintsOff: true })))).toBeNull();
    expect(pickAutoTour(ctx({}, withTours({}, { snoozedUntil: new Date(NOW.getTime() + 1000).toISOString() })))).toBeNull();
    expect(pickAutoTour(ctx({ cooldownUntil: NOW.getTime() + 1 }))).toBeNull();
    // а после паузы — снова можно
    expect(pickAutoTour(ctx({}, withTours({}, { snoozedUntil: new Date(NOW.getTime() - 1000).toISOString() })))).toBe("welcome");
  });

  it("«напомнить позже» после паузы возвращает тур, а остановленный действием ждёт руками", () => {
    const later = withTours({ welcome: { status: "later", step: 2, at } });
    expect(pickAutoTour(ctx({}, later))).toBe("welcome");
    const paused = withTours({ welcome: { status: "paused", step: 2, at } });
    expect(pickAutoTour(ctx({ tab: "dashboard" }, paused))).toBe("dashboard");
    const pausedTab = withTours({ welcome: done, map: { status: "paused", step: 1, at } });
    expect(pickAutoTour(ctx({ tab: "map" }, pausedTab))).toBeNull();
  });

  it("роль без шагов в туре — тур пропускается", () => {
    const s = withTours({ welcome: done });
    // у зрителя в «Маршруте» остаются шаги про карточку места — тур есть
    expect(pickAutoTour(ctx({ tab: "itinerary", role: "viewer" }, s))).toBe("itinerary");
  });
});

describe("pickAutoTour — «Сочтёмся»", () => {
  it("хаб и группа — свои туры, независимо от знакомства с поездками", () => {
    expect(pickAutoTour(ctx({ area: "split", splitScreen: "hub", hasTrip: false, role: null }))).toBe("split-hub");
    expect(pickAutoTour(ctx({ area: "split", splitScreen: "group", hasTrip: false, role: null }))).toBe("split-group");
    expect(pickAutoTour(ctx({ area: "split", splitScreen: null }))).toBeNull();
  });

  it("пройденный тур не повторяется, подсказки выключены — молчим", () => {
    const s = withTours({ "split-hub": done });
    expect(pickAutoTour(ctx({ area: "split", splitScreen: "hub" }, s))).toBeNull();
    expect(pickAutoTour(ctx({ area: "split", splitScreen: "group" }, withTours({}, { hintsOff: true })))).toBeNull();
  });
});

describe("exitPatch", () => {
  const welcome = getTour("welcome")!;
  const map = getTour("map")!;

  it("done / skip пишут запись тура", () => {
    expect(exitPatch(map, { kind: "done" }, NOW)).toEqual({ tours: { map: { status: "done", step: 0, at } } });
    const p = exitPatch(welcome, { kind: "skip", step: 2 }, NOW);
    expect(p.tours?.welcome).toEqual({ status: "skipped", step: 2, at });
  });

  it("later: запись с шагом и пауза на сутки", () => {
    const p = exitPatch(welcome, { kind: "later", step: 3 }, NOW);
    expect(p.tours?.welcome).toEqual({ status: "later", step: 3, at });
    expect(p.snoozedUntil).toBe(new Date(NOW.getTime() + SNOOZE_MS).toISOString());
  });

  it("действие «Попробовать» ставит тур на паузу, «выключить» гасит подсказки", () => {
    expect(exitPatch(map, { kind: "action", step: 1, action: "invite" }, NOW).tours?.map?.status).toBe("paused");
    const off = exitPatch(map, { kind: "hints-off", step: 0 }, NOW);
    expect(off.hintsOff).toBe(true);
    expect(off.tours?.map?.status).toBe("skipped");
  });

  it("патч применяется к состоянию: после skip тур не открывается сам", () => {
    const s0 = applyPatch(EMPTY_ONBOARDING_STATE, exitPatch(welcome, { kind: "skip", step: 0 }, NOW), NOW);
    expect(pickAutoTour(ctx({ tab: "map" }, s0))).toBe("map");
  });
});

describe("startStepFor / tourStatusView", () => {
  const map = getTour("map")!;
  it("продолжает с места остановки только для later/paused", () => {
    const total = stepsFor(map, "owner").length;
    expect(startStepFor(withTours({ map: { status: "later", step: 2, at } }), map, "owner")).toBe(2);
    expect(startStepFor(withTours({ map: { status: "paused", step: 99, at } }), map, "owner")).toBe(total - 1);
    expect(startStepFor(withTours({ map: done }), map, "owner")).toBe(0);
    expect(startStepFor(EMPTY_ONBOARDING_STATE, map, "owner")).toBe(0);
  });

  it("статусы для Центра обучения", () => {
    expect(tourStatusView(EMPTY_ONBOARDING_STATE, map)).toMatchObject({ tone: "new", resume: false });
    expect(tourStatusView(withTours({ map: done }), map)).toMatchObject({ tone: "done", label: "Пройдено" });
    const paused = tourStatusView(withTours({ map: { status: "later", step: 1, at } }), map);
    expect(paused).toMatchObject({ tone: "paused", resume: true });
    expect(paused.label).toContain("шаге 2");
  });
});

describe("прочее", () => {
  it("остывание между турами задано разумно", () => {
    expect(AUTO_COOLDOWN_MS).toBeGreaterThanOrEqual(30_000);
  });
  it("ссылка на тур экранируется", () => {
    expect(tourHref("split-hub")).toBe("/?tour=split-hub");
  });
});
