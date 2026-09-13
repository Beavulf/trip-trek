// Чистое построение «нитей маршрута» — логика, которая раньше была замурована
// в RouteThreads внутри trip-map.tsx и не покрывалась тестами.
// Порядок мест дня задаёт линию на карте: сортировка по TimeOfDay должна совпадать
// с порядком карточек дня (единый timeSortRank). Кандидат №3 аудита, фаза 4b.
import type { Day, Place } from "./types";
import { timeSortRank } from "./time-of-day";

export interface RouteThreadInput {
  place: Place;
  day: Day;
}

export interface RouteSegment {
  dayId: string;
  a: Place;
  b: Place;
  /** Оба конца посещены — сегмент сплошной (иначе пунктир «впереди») */
  done: boolean;
  /** Сегмент сегодняшнего дня — рисуется толще в отдельной панели */
  isToday: boolean;
  color: string;
}

export function buildRouteThreads(
  places: RouteThreadInput[],
  currentDayNumber?: number
): RouteSegment[] {
  const byDay = new Map<string, { day: Day; pts: Place[] }>();
  for (const { place, day } of places) {
    if (!byDay.has(day.id)) byDay.set(day.id, { day, pts: [] });
    byDay.get(day.id)!.pts.push(place);
  }

  const segments: RouteSegment[] = [];
  for (const { day, pts } of byDay.values()) {
    // Порядок обхода: время суток, затем исходный порядок списка
    const sorted = pts
      .map((p, i) => ({ p, i, r: timeSortRank(p.timeOfDay) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.p);
    const isToday = day.dayNumber === currentDayNumber;
    const color = day.accentColor ?? "#f97316";
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      segments.push({
        dayId: day.id,
        a,
        b,
        done: a.status === "visited" && b.status === "visited",
        isToday,
        color,
      });
    }
  }
  return segments;
}
