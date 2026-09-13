// Чистые селекторы модели чтения маршрута (Route) — общий знаменатель карты,
// маршрута и ленты. Раньше эта математика была memo'ами внутри trip-map.tsx
// и дублировалась в Itinerary/timeline. Кандидат №1 аудита 2026-09-12, фаза 3.
import type { Day, Place } from "./types";

export interface RoutePlace {
  place: Place;
  day: Day;
}

/** Плоский список мест с привязкой к дню — вход для фильтров карты и RouteThreads. */
export function buildRoutePlaces(days: Day[]): RoutePlace[] {
  return days.flatMap((d) => d.places.map((p) => ({ place: p, day: d })));
}

export interface RouteCity {
  cityKey: string;
  city: string;
  accentColor: string;
  count: number;
}

/** Города маршрута в порядке следования дней, с количеством мест. */
export function buildRouteCities(days: Day[], places: RoutePlace[]): RouteCity[] {
  const seen = new Map<string, RouteCity>();
  for (const d of days) {
    if (!seen.has(d.cityKey)) {
      seen.set(d.cityKey, {
        cityKey: d.cityKey,
        city: d.city,
        accentColor: d.accentColor ?? "#f97316",
        count: 0,
      });
    }
  }
  for (const { day } of places) {
    const c = seen.get(day.cityKey);
    if (c) c.count += 1;
  }
  return [...seen.values()];
}

export function countVisited(places: RoutePlace[]): number {
  return places.filter((x) => x.place.status === "visited").length;
}
