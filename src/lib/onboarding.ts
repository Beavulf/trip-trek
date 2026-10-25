// Логика обучения без React: какой тур открыть сам, как закрытие превращается в запись
// о прогрессе. Содержимое туров — onboarding-content.ts, формат состояния — onboarding-state.ts.
// Всё чистое и покрыто тестами; React-часть (TourHost, диалог) только исполняет решения отсюда.

import {
  ONBOARDING_CONTENT_VERSION,
  isSnoozed,
  type OnboardingPatch,
  type OnboardingState,
  type TourProgress,
} from "./onboarding-state";
import { getTour, stepsFor, tourForTab, type StepActionKind, type TourDef, type TourRole } from "./onboarding-content";
import type { TripTab } from "./trip-store";

export {
  ONBOARDING_CONTENT_VERSION,
  type OnboardingPatch,
  type OnboardingState,
  type TourProgress,
} from "./onboarding-state";
export { TOURS, getTour, tourForTab, centerTours, stepsFor, type TourDef, type TourRole } from "./onboarding-content";

/** После закрытия любого тура сами подсказки молчат это время — не заваливать человека подряд */
export const AUTO_COOLDOWN_MS = 45_000;
/** «Напомнить позже» */
export const SNOOZE_MS = 24 * 60 * 60 * 1000;
/** Пауза перед автозапуском: сперва должен показаться сам экран */
export const AUTO_OPEN_DELAY_MS = 900;

export type TourArea = "trip" | "split";

export interface PickContext {
  state: OnboardingState;
  area: TourArea;
  tab: TripTab;
  splitScreen: "hub" | "group" | null;
  hasTrip: boolean;
  /** null — роль ещё не известна (поездка грузится) */
  role: TourRole | null;
  now: number;
  cooldownUntil: number;
}

/** Тур ждёт показа сам: записи нет или человек просил «напомнить позже» */
function autoEligible(state: OnboardingState, def: TourDef, role: TourRole | null): boolean {
  const s = state.tours[def.id]?.status;
  if (s === "done" || s === "skipped" || s === "paused") return false;
  return stepsFor(def, role).length > 0;
}

/** Тур закончен или отложен руками: больше не блокирует следующие */
function resolved(state: OnboardingState, id: string): boolean {
  const s = state.tours[id]?.status;
  return s === "done" || s === "skipped" || s === "paused";
}

/** Какой тур открыть сам прямо сейчас (null — никакой). Ручной запуск этим не ограничен */
export function pickAutoTour(ctx: PickContext): string | null {
  const { state } = ctx;
  if (state.hintsOff || isSnoozed(state, ctx.now) || ctx.now < ctx.cooldownUntil) return null;

  if (ctx.area === "split") {
    if (!ctx.splitScreen) return null;
    const def = getTour(ctx.splitScreen === "hub" ? "split-hub" : "split-group");
    return def && autoEligible(state, def, ctx.role) ? def.id : null;
  }

  if (!ctx.hasTrip || ctx.role === null) return null;

  const welcome = getTour("welcome");
  if (welcome && autoEligible(state, welcome, ctx.role)) return welcome.id;
  if (!resolved(state, "welcome")) return null;

  const news = getTour("whatsnew");
  if (news && ctx.tab === "dashboard" && state.seenVersion < ONBOARDING_CONTENT_VERSION && autoEligible(state, news, ctx.role)) {
    return news.id;
  }

  const def = tourForTab(ctx.tab);
  return def && autoEligible(state, def, ctx.role) ? def.id : null;
}

/** Шаг, с которого открывать тур: «напомнить позже» и пауза продолжаются с места остановки */
export function startStepFor(state: OnboardingState, def: TourDef, role: TourRole | null): number {
  const p = state.tours[def.id];
  const total = stepsFor(def, role).length;
  if (!p || (p.status !== "later" && p.status !== "paused")) return 0;
  return Math.min(Math.max(0, p.step), Math.max(0, total - 1));
}

export type TourExit =
  | { kind: "done"; action?: StepActionKind }
  | { kind: "skip"; step: number }
  | { kind: "later"; step: number }
  | { kind: "action"; step: number; action: StepActionKind }
  | { kind: "hints-off"; step: number };

/**
 * Как закрытие тура пишется в состояние. Welcome и «Что нового» при завершении или
 * пропуске отмечают, что версию новостей человек уже видел — новичку не нужно «новое».
 */
export function exitPatch(def: TourDef, exit: TourExit, now: Date): OnboardingPatch {
  const at = now.toISOString();
  const entry = (status: TourProgress["status"], step: number): TourProgress => ({ status, step, at });
  const patch: OnboardingPatch = {};
  switch (exit.kind) {
    case "done":
      patch.tours = { [def.id]: entry("done", 0) };
      break;
    case "skip":
      patch.tours = { [def.id]: entry("skipped", exit.step) };
      break;
    case "action":
      patch.tours = { [def.id]: entry("paused", exit.step) };
      break;
    case "later":
      patch.tours = { [def.id]: entry("later", exit.step) };
      patch.snoozedUntil = new Date(now.getTime() + SNOOZE_MS).toISOString();
      break;
    case "hints-off":
      patch.tours = { [def.id]: entry("skipped", exit.step) };
      patch.hintsOff = true;
      break;
  }
  const finished = exit.kind === "done" || exit.kind === "skip" || exit.kind === "hints-off";
  if (finished && (def.kind === "welcome" || def.kind === "whatsnew")) {
    patch.seenVersion = ONBOARDING_CONTENT_VERSION;
  }
  return patch;
}

/** Параметр `?tour=<id>` для ссылки «открыть этот тур» из Профиля */
export function tourHref(id: string): string {
  return `/?tour=${encodeURIComponent(id)}`;
}

export interface TourStatusView {
  label: string;
  tone: "done" | "paused" | "new";
  /** Кнопка: «Продолжить» с места остановки или «Смотреть» с начала */
  resume: boolean;
}

/** Как тур выглядит в Центре обучения */
export function tourStatusView(state: OnboardingState, def: TourDef): TourStatusView {
  const p = state.tours[def.id];
  const total = stepsFor(def, null).length;
  if (!p) return { label: "Не смотрели", tone: "new", resume: false };
  if (p.status === "done") return { label: "Пройдено", tone: "done", resume: false };
  if (p.status === "skipped") return { label: "Пропущено", tone: "new", resume: false };
  const at = Math.min(p.step + 1, total);
  return { label: `Остановились на шаге ${at} из ${total}`, tone: "paused", resume: true };
}
