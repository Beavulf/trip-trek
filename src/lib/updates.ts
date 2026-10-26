// Логика ленты обновлений без React: какие записи видны, какие не прочитаны, что можно
// нажать. Содержимое — updates-content.ts, «прочитано» хранится на аккаунте (updatesRead).

import type { TourRole } from "./onboarding-content";
import type { OnboardingState } from "./onboarding-state";
import { UPDATES, type UpdateActionKind, type UpdateArea, type UpdateEntry } from "./updates-content";

export type UpdatesScope = "trip" | "split";

/** Записи для окна колокольчика поездки или «Сочтёмся», новые сверху */
export function updatesFor(scope: UpdatesScope, entries: UpdateEntry[] = UPDATES): UpdateEntry[] {
  const ok = (a: UpdateArea) => a === "all" || a === scope;
  return entries.filter((u) => ok(u.area)).sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

/**
 * Не прочитана ли запись. Новичку история не нужна: всё, что вышло в день его
 * регистрации и раньше, считается прочитанным без единой записи на сервер.
 */
export function isUpdateUnread(entry: UpdateEntry, state: OnboardingState, joinedAt: string | null | undefined): boolean {
  if (state.updatesRead.includes(entry.id)) return false;
  if (joinedAt) {
    const t = Date.parse(joinedAt);
    if (!Number.isNaN(t) && entry.date <= new Date(t).toISOString().slice(0, 10)) return false;
  }
  return true;
}

export function unreadUpdates(entries: UpdateEntry[], state: OnboardingState, joinedAt: string | null | undefined): UpdateEntry[] {
  return entries.filter((u) => isUpdateUnread(u, state, joinedAt));
}

/** Зритель только читает: форм добавления и приглашений для него нет. «Центр обучения» — только в экране поездки */
export function actionAllowed(action: UpdateActionKind, role: TourRole | null, scope: UpdatesScope): boolean {
  if (action === "center") return scope === "trip";
  if (scope === "split") return action === "split" || action === "profile-ai";
  if (role === "viewer" && (action.startsWith("quickadd:") || action === "invite")) return false;
  return true;
}

/** «25 окт» / «25 окт 2025» (год — только если не текущий) */
export function formatUpdateDate(date: string, now: Date = new Date()): string {
  const d = new Date(`${date}T12:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  if (d.getUTCFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("ru-RU", opts).replace(/\s?г\.$/, "");
}
