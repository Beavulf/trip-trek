// Обучение (welcome-tour) и контекстные подсказки вкладок.
// Файл умышленно без React: шаги/подсказки — данные, storage — чистые функции,
// покрытые юнит-тестами. Статус «пройдено» живёт на аккаунте
// (User.onboardingCompletedAt), локальная тень в localStorage страхует от
// повторного открытия, пока PATCH не долетел (офлайн/обрыв).

import type { TripTab } from "./trip-store";

// === Приветственный тур: 5 шагов, по одной мысли на шаг ===

export interface TourStep {
  id: string;
  art: "welcome" | "tabs" | "quickadd" | "invite" | "done";
  title: string;
  text: string;
  /** Своя надпись основной кнопки (по умолчанию «Далее») */
  cta?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    art: "welcome",
    title: "Добро пожаловать в TripTrek!",
    text: "Маршрут, бюджет, карта и воспоминания поездки — в одном месте, вместе с друзьями.",
  },
  {
    id: "tabs",
    art: "tabs",
    title: "Всё — по вкладкам",
    text: "Разделы поездки — во вкладках сверху: обзор, маршрут, карта, бюджет и другие.",
  },
  {
    id: "quickadd",
    art: "quickadd",
    title: "Кнопка «+» — главный помощник",
    text: "Добавить место, трату, фото или заметку можно из любой вкладки — в два тапа.",
  },
  {
    id: "invite",
    art: "invite",
    title: "Планируйте вместе",
    text: "Пригласите друзей по коду или ссылке — все изменения видны каждому сразу.",
  },
  {
    id: "done",
    art: "done",
    title: "Готово!",
    text: "Краткие подсказки будут встречать вас на новых вкладках. Обучение можно пройти заново в Профиле.",
    cta: "Всё ясно",
  },
];

// === Контекстные подсказки: раз показались на вкладке — больше не появляются ===

export interface TourHint {
  id: string;
  tab: TripTab;
  title: string;
  text: string;
}

export const TAB_HINTS: TourHint[] = [
  {
    id: "itinerary",
    tab: "itinerary",
    title: "Маршрут",
    text: "План по дням: города, места и время. Добавить — кнопкой «+» внизу.",
  },
  {
    id: "map",
    tab: "map",
    title: "Карта",
    text: "Все места поездки на карте. Тап по точке — карточка места.",
  },
  {
    id: "budget",
    tab: "budget",
    title: "Бюджет",
    text: "Записывайте траты — долги между участниками посчитаются сами.",
  },
  {
    id: "board",
    tab: "board",
    title: "Чат",
    text: "Общий чат поездки: обсуждайте планы — всё видно всем участникам.",
  },
];

// === Локальные отметки устройства (SSR-safe, отказоустойчивые к private mode) ===

const localDoneKey = (userId: string) => `triptrek-tour-local-done:${userId}`;
const seenHintsKey = (userId: string) => `triptrek-hints-seen:${userId}`;

/** Локальная тень «тур закрыт»: защищает от повторного открытия, пока PATCH в пути/потерялся. */
export function readLocalTourDone(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(localDoneKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeLocalTourDone(userId: string | null | undefined, done: boolean): void {
  if (!userId || typeof window === "undefined") return;
  try {
    if (done) window.localStorage.setItem(localDoneKey(userId), "1");
    else window.localStorage.removeItem(localDoneKey(userId));
  } catch {
    // private mode / переполненная квота — обучение просто покажется снова, не страшно
  }
}

/** Подсказки, уже показанные на этом устройстве. null = ещё не гидрировали. */
export function readSeenHints(userId: string | null | undefined): string[] | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(seenHintsKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

/** Отметить подсказку показанной; возвращает обновлённый список (дедупликация). */
export function writeSeenHint(userId: string | null | undefined, hintId: string): string[] {
  const current = readSeenHints(userId) ?? [];
  if (current.includes(hintId)) return current;
  const next = [...current, hintId];
  if (userId && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(seenHintsKey(userId), JSON.stringify(next));
    } catch {
      // как выше: приватный режим — подсказки будут показываться заново
    }
  }
  return next;
}

/** «Пройти заново» — подсказки тоже показываем с чистого листа. */
export function clearSeenHints(userId: string | null | undefined): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(seenHintsKey(userId));
  } catch {
    // игнорируем — см. выше
  }
}
