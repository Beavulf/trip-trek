// Черновик формы места и дифф к базе — контракт между формой (PlaceForm)
// и API-патчем (PlacePatch из place-fields). Раньше create и edit держали
// две отдельные state-машины с ручными dirty-чеклистами. Фаза 5.
import type { Place } from "./types";
import type { PlacePatch } from "./place-fields";

export interface PlaceDraft {
  name: string;
  category: string;
  /** Слот времени; "" = не выбрано (в API уходит null) */
  timeOfDay: string;
  /** Бюджет как строка ввода; в API парсится в number|null */
  budget: string;
  address: string;
  description: string;
  /** Координаты точки: редактируются выбором на карте (MapPicker) */
  lat: number;
  lng: number;
  /** Только для создания: день размещения */
  dayId: string;
}

export function draftFromPlace(place: Place, dayId?: string): PlaceDraft {
  return {
    name: place.name,
    category: place.category,
    timeOfDay: place.timeOfDay || "",
    budget: place.budget != null ? String(place.budget) : "",
    address: place.address || "",
    description: place.description || "",
    lat: place.lat,
    lng: place.lng,
    dayId: dayId ?? place.dayId,
  };
}

export function parseBudget(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

/**
 * Что изменилось относительно базы — готовое тело PATCH (PlacePatch).
 * Пустой объект = нет изменений. Чистая функция — покрыта тестом.
 */
export function diffPlaceDraft(base: PlaceDraft, cur: PlaceDraft): PlacePatch {
  const patch: PlacePatch = {};
  const name = cur.name.trim();
  if (name !== base.name) patch.name = name;
  if (cur.category !== base.category) patch.category = cur.category;
  if (cur.timeOfDay !== base.timeOfDay) patch.timeOfDay = cur.timeOfDay || null;
  if (parseBudget(cur.budget) !== parseBudget(base.budget)) patch.budget = parseBudget(cur.budget);
  if (cur.address.trim() !== (base.address || "")) patch.address = cur.address.trim() || null;
  if (cur.description.trim() !== (base.description || "")) patch.description = cur.description.trim() || null;
  // Точку двигают картой — пара lat/lng меняется вместе; GPS-шум отсекаем эпсилоном
  if (Math.abs(cur.lat - base.lat) > 1e-7 || Math.abs(cur.lng - base.lng) > 1e-7) {
    patch.lat = cur.lat;
    patch.lng = cur.lng;
  }
  return patch;
}
