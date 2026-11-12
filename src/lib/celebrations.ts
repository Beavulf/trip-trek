// Моменты-праздники: чистые правила «когда праздновать». Компоненты (TripFinale,
// split/balance-tab, achievements) решают только, где взять данные, а пороги,
// seen-ключи и подача — здесь, с тестами. Ничего не импортирует: vitest node-env
// не должен тянуть lucide-react из lib/achievements.

/** Минимальный набор полей бейджа (структурно совместим с Badge из lib/achievements) */
export interface CelebratedBadge {
  id: string;
  title: string;
  emoji: string;
  description: string;
}

// Ключи seen-флагов в localStorage — по id поездки/группы.
export const debtHadKey = (tripId: string) => `tt-debts-had-${tripId}`;
export const debtClearSeenKey = (tripId: string) => `tt-debts-clear-seen-${tripId}`;
export const recapSeenKey = (tripId: string) => `tt-recap-seen-${tripId}`;
export const splitHadKey = (groupId: string) => `tt-split-had-${groupId}`;
export const splitClearSeenKey = (groupId: string) => `tt-split-clear-seen-${groupId}`;

/** Долги закрыты: долг был → стало чисто → ещё не праздновали */
export function shouldCelebrateDebts(hadDebts: boolean, nowClear: boolean, clearSeen: boolean): boolean {
  return hadDebts && nowClear && !clearSeen;
}

/** Авто-«Итоги»: конец поездки, долгов нет, было что вспоминать (иначе пустая фраза), не показывали */
export function shouldAutoRecap(a: {
  finished: boolean;
  hasDebts: boolean;
  hadSpending: boolean;
  seen: boolean;
}): boolean {
  return a.finished && !a.hasDebts && a.hadSpending && !a.seen;
}

/** «Чисто!» в «Сочтёмся»: то же, что shouldCelebrateDebts, плюс была ли вообще активность */
export function shouldCelebrateSplit(
  hadDebts: boolean,
  nowClear: boolean,
  hasActivity: boolean,
  clearSeen: boolean
): boolean {
  return hasActivity && hadDebts && nowClear && !clearSeen;
}

export interface BadgeCelebration {
  mode: "list" | "count";
  badges: CelebratedBadge[];
}

/** ≤3 свежих награды — карточки списком; больше — «Новых наград: N» */
export function pickBadgePresentation(fresh: CelebratedBadge[]): BadgeCelebration | null {
  if (fresh.length === 0) return null;
  return { mode: fresh.length <= 3 ? "list" : "count", badges: fresh };
}
