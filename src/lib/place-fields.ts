// Контракт записи Place: единственный ручной список редактируемых полей
// и общий нормализатор для POST /api/places и PATCH /api/places/[id].
// Раньше список полей дублировался в schema/POST/PATCH/select (добавление поля = ~14 файлов),
// а update в хуке был нетипизированным Record<string, unknown> — дрейф проходил молча.
// Кандидат №2 аудита 2026-09-12, фаза 2.
import type { Place } from "./types";

/**
 * Поля, которые клиент может писать через POST/PATCH.
 * Не входят: id, tripId (из пути/гарда), order (считает сервер), status-заметки — status входит.
 */
export const PLACE_PATCHABLE = [
  "name",
  "description",
  "category",
  "lat",
  "lng",
  "timeOfDay",
  "budget",
  "address",
  "notes",
  "rating",
  "status",
  "visitedAt",
  "dayId",
] as const satisfies readonly (keyof Place)[];

// visitedAt переопределяется: в read-модели Place это строка (JSON), сервер пишет Date
export type PlacePatch = Omit<
  Partial<Pick<Place, (typeof PLACE_PATCHABLE)[number]>>,
  "visitedAt"
> & { visitedAt?: Date | string | null };

// Капы длин строк — те же, что ввела security-сессия в POST; теперь и PATCH не разойдётся.
const CAPS = {
  name: 200,
  description: 2000,
  notes: 2000,
  category: 50,
  timeOfDay: 20,
  address: 300,
} as const;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/**
 * Оставляет только известные поля и нормализует значения.
 * Пустые строки в nullable-полях → null; неизвестные/запрещённые поля (id, tripId, order, userName) отбрасываются.
 * Чистая функция — покрыта тестом контракта.
 */
export function pickPatchablePlace(body: unknown): PlacePatch {
  if (!isObj(body)) return {};
  const out: PlacePatch = {};
  const take = <K extends keyof PlacePatch>(k: K, v: PlacePatch[K]) => {
    if (v !== undefined) out[k] = v;
  };

  for (const k of PLACE_PATCHABLE) {
    if (!(k in body)) continue;
    const v = body[k];
    switch (k) {
      case "name":
        if (typeof v === "string" && v.trim()) take("name", v.slice(0, CAPS.name));
        break;
      case "description":
      case "notes":
      case "address":
        if (v === null) take(k, null);
        else if (typeof v === "string") take(k, v.slice(0, CAPS[k]) || null);
        break;
      case "timeOfDay":
        if (v === null) take("timeOfDay", null);
        else if (typeof v === "string") take("timeOfDay", v.slice(0, CAPS.timeOfDay) || null);
        break;
      case "category":
        if (typeof v === "string" && v.trim()) take("category", v.slice(0, CAPS.category));
        break;
      case "lat":
      case "lng":
        if (typeof v === "number" && Number.isFinite(v)) take(k, v);
        break;
      case "budget":
      case "rating":
        if (v === null) take(k, null);
        else if (typeof v === "number" && Number.isFinite(v)) take(k, v);
        break;
      case "status":
        if (v === "planned" || v === "visited" || v === "current") take("status", v);
        break;
      case "visitedAt":
        if (v === null) take("visitedAt", null);
        else if (v instanceof Date) take("visitedAt", v);
        else if (typeof v === "string") {
          const d = new Date(v);
          if (!isNaN(d.getTime())) take("visitedAt", d);
        }
        break;
      case "dayId":
        if (typeof v === "string" && v) take("dayId", v);
        break;
    }
  }
  return out;
}

/** Ввод создания места: обязательный костяк + опциональные поля (tripId добавляет хук/роут). */
export type PlaceCreateInput = Pick<Place, "name" | "category" | "lat" | "lng" | "dayId"> &
  Partial<Pick<Place, "description" | "timeOfDay" | "budget" | "address" | "order">>;
