// Единый источник слотов времени суток (Place.timeOfDay).
// Раньше порядок дня задавался руками в 7 файлах (TIME_RANK на карте, TIME_SECTIONS
// в DayCard, TIMES в диалоге, две timeLabel, TimeChip, инлайн-option) — линия на
// карте могла молча разойтись с порядком карточек дня. Добавление слота — правка
// только этой таблицы. Кандидат №4 аудита 2026-09-12, фаза 1.
import type { Place } from "./types";

export interface TimeSlot {
  key: string;
  label: string;
  emoji: string;
}

export const TIME_SLOTS: TimeSlot[] = [
  { key: "morning", label: "Утро", emoji: "🌅" },
  { key: "afternoon", label: "День", emoji: "☀️" },
  { key: "evening", label: "Вечер", emoji: "🌙" },
];

// Место без времени суток сортируется между «Днём» и «Вечером» (историческое 1.5 с карты).
const UNKNOWN_RANK = 1.5;

const RANK_BY_KEY = new Map(TIME_SLOTS.map((s, i) => [s.key, i]));

/** Порядок слота для сортировки маршрута дня; null/неизвестный/пустой — 1.5. */
export function timeSortRank(t: string | null | undefined): number {
  if (!t) return UNKNOWN_RANK;
  return RANK_BY_KEY.get(t) ?? UNKNOWN_RANK;
}

/**
 * Подпись слота. Варианты: plain — «Утро» (чипы в карточке дня),
 * emoji — «🌅 Утро» (формы, дашборд). fallback — текст для неизвестного слота
 * (дашборд использует «Весь день», карточка дня — пустую строку).
 */
export function timeLabel(
  t: string | null | undefined,
  opts?: { emoji?: boolean; fallback?: string }
): string {
  const slot = TIME_SLOTS.find((s) => s.key === t);
  if (!slot) return opts?.fallback ?? "";
  return opts?.emoji ? `${slot.emoji} ${slot.label}` : slot.label;
}

/** Ключ иконки слота для UI (lucide): sunrise/sun/moon; неизвестный — null. */
export function timeIconKey(t: string | null | undefined): "sunrise" | "sun" | "moon" | null {
  if (t === "morning") return "sunrise";
  if (t === "afternoon") return "sun";
  if (t === "evening") return "moon";
  return null;
}

/** Слот по часу суток: время старта («14:30» прогулки) → слот места маршрута. */
export function timeSlotFromHour(hour: number): string | null {
  if (!Number.isFinite(hour)) return null;
  const h = ((hour % 24) + 24) % 24;
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export interface DaySection {
  key: string;
  label: string;
  places: Place[];
}

/**
 * Группировка мест дня по слотам в каноническом порядке.
 * Если ни у одного места нет timeOfDay — одна секция «all» без заголовка.
 * Места без слота при смешанном дне попадают в «other» («Без времени»).
 */
export function daySections(places: Place[]): DaySection[] {
  if (!places.some((p) => p.timeOfDay)) {
    return [{ key: "all", label: "", places }];
  }
  const sections: DaySection[] = TIME_SLOTS.map((s) => ({
    key: s.key,
    label: s.label,
    places: places.filter((p) => p.timeOfDay === s.key),
  })).filter((s) => s.places.length > 0);
  const rest = places.filter((p) => !p.timeOfDay);
  if (rest.length > 0) {
    sections.push({ key: "other", label: "Без времени", places: rest });
  }
  return sections;
}
