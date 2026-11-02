// Внешние ссылки маршрута по месту. Раньше Google-ссылка дублировалась в трёх
// файлах и могла разойтись (OSM-вариант для чилла уже был свой — share.ts).
import { resolveCityCoords } from "./city-coords";
import { inMainlandChina } from "./mainland-china";

/** Маршрут до точки в Amap. Координаты у нас WGS84, параметр coordinate сообщает об этом карте */
export function amapDirectionsUrl(lat: number, lng: number, name: string) {
  return `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name)}&coordinate=wgs84&callnative=1`;
}

/** Поиск в Amap, когда координат нет */
export function amapSearchUrl(query: string) {
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(query)}&callnative=1`;
}

export function googleDirectionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Поиск по адресу — когда у места нет координат (жильё вводят текстом). */
export function googleSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** «Как добраться»: карта выбирается по самой точке, поэтому в поездке через две страны не путается */
export function directionsUrl(p: { lat: number; lng: number; name: string }) {
  return inMainlandChina(p.lat, p.lng) ? amapDirectionsUrl(p.lat, p.lng, p.name) : googleDirectionsUrl(p.lat, p.lng);
}

export interface RouteDayPoints {
  city: string;
  cityKey?: string | null;
  places: { lat: number; lng: number }[];
}

/** Точки дня: места маршрута и сам город дня, если он выбран из поиска */
function dayPoints(day: RouteDayPoints): { lat: number; lng: number }[] {
  const city = resolveCityCoords(day.cityKey ?? "");
  return city ? [...day.places, city] : day.places;
}

/**
 * Куда вести поиск по адресу, когда координат нет (жильё вводят текстом): страну подсказывают
 * точки маршрута в том же городе, а если таких нет — вся поездка, только когда она целиком в Китае.
 */
export function searchInChina(city: string | null, days: readonly RouteDayPoints[]): boolean {
  const sameCity = city ? days.filter((d) => d.city === city).flatMap(dayPoints) : [];
  const points = sameCity.length > 0 ? sameCity : days.flatMap(dayPoints);
  return points.length > 0 && points.every((p) => inMainlandChina(p.lat, p.lng));
}

/** Есть ли в поездке точки в материковом Китае: для подсказки про карты на вкладке «Карта» */
export function tripTouchesChina(days: readonly RouteDayPoints[]): boolean {
  return days.flatMap(dayPoints).some((p) => inMainlandChina(p.lat, p.lng));
}
