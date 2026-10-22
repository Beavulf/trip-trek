// Проживание (модель Lodging): чистая логика без БД и React — даты, фазы,
// «дыры» в ночёвках, нормализатор входа API. Покрыта lodging.test.ts.
//
// Даты проживания — КАЛЕНДАРНЫЕ, без часового пояса. В БД лежит полдень UTC выбранного
// дня: от -12 до +11 часов календарный день не меняется, поэтому «7 окт» остаётся
// «7 окт» и на сервере (UTC), и в Минске, и в Китае. Везде работаем с ключами
// YYYY-MM-DD, а не с Date, чтобы не размазывать поясную арифметику по UI.

/** Проживание в том виде, в каком его отдаёт API (даты — ISO-строки). */
export interface Lodging {
  id: string;
  tripId: string;
  name: string;
  nameLocal: string | null;
  city: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  checkIn: string;
  checkOut: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  bookingRef: string | null;
  bookingUrl: string | null;
  phone: string | null;
  price: number | null;
  notes: string | null;
}

/** Потолок цены проживания в валюте поездки (как MAX_PLACE_BUDGET: отсекает опечатки). */
export const MAX_LODGING_PRICE = 1_000_000;

const DAY_MS = 86_400_000;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ключ календарного дня из значения БД/API (ISO-строка или Date). */
export function toDateKey(v: string | Date): string {
  return (typeof v === "string" ? v : v.toISOString()).slice(0, 10);
}

/** Значение для БД из ключа YYYY-MM-DD: полдень UTC. null — ключ невалиден. */
export function keyToStoredDate(key: string): Date | null {
  if (!KEY_RE.test(key)) return null;
  const d = new Date(`${key}T12:00:00.000Z`);
  // new Date("2026-02-31") не бросает — нормализует; сверяем, что день не уехал
  return Number.isNaN(d.getTime()) || toDateKey(d) !== key ? null : d;
}

/** Сегодняшний календарный день по ЛОКАЛЬНЫМ часам устройства (а не UTC). */
export function localTodayKey(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

const keyMs = (key: string) => Date.parse(`${key}T00:00:00.000Z`);

/** Целое число суток между днями (b − a). */
export function daysBetween(aKey: string, bKey: string): number {
  return Math.round((keyMs(bKey) - keyMs(aKey)) / DAY_MS);
}

export function addDaysKey(key: string, n: number): string {
  return new Date(keyMs(key) + n * DAY_MS).toISOString().slice(0, 10);
}

export const nightsOf = (l: Pick<Lodging, "checkIn" | "checkOut">): number =>
  Math.max(0, daysBetween(toDateKey(l.checkIn), toDateKey(l.checkOut)));

export type LodgingPhase = "past" | "current" | "upcoming";

/**
 * Фаза проживания на день today: до заезда — upcoming, с заезда до выезда (выезд не
 * включая: ночь дня выезда уже в другом месте) — current, после — past.
 * Выезд в день заезда (0 ночей, «день в номере») — current только в этот день.
 */
export function lodgingPhase(l: Pick<Lodging, "checkIn" | "checkOut">, todayKey: string): LodgingPhase {
  const inKey = toDateKey(l.checkIn);
  const outKey = toDateKey(l.checkOut);
  if (todayKey < inKey) return "upcoming";
  if (inKey === outKey) return todayKey === inKey ? "current" : "past";
  return todayKey < outKey ? "current" : "past";
}

export function sortLodgings<T extends Pick<Lodging, "checkIn" | "checkOut">>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => toDateKey(a.checkIn).localeCompare(toDateKey(b.checkIn)) || toDateKey(a.checkOut).localeCompare(toDateKey(b.checkOut))
  );
}

export function currentLodging<T extends Pick<Lodging, "checkIn" | "checkOut">>(list: T[], todayKey: string): T | undefined {
  return sortLodgings(list).find((l) => lodgingPhase(l, todayKey) === "current");
}

export function nextLodging<T extends Pick<Lodging, "checkIn" | "checkOut">>(list: T[], todayKey: string): T | undefined {
  return sortLodgings(list).find((l) => lodgingPhase(l, todayKey) === "upcoming");
}

/** Номер текущей ночи проживания (1 — в день заезда). */
export function nightNumber(l: Pick<Lodging, "checkIn">, todayKey: string): number {
  return daysBetween(toDateKey(l.checkIn), todayKey) + 1;
}

export interface LodgingGap {
  /** Первая ночь без жилья */
  fromKey: string;
  /** День, в который жильё уже есть (или конец поездки) — ночи [fromKey, toKey) */
  toKey: string;
  nights: number;
}

/**
 * Ночи поездки без жилья. Ночи — это дни [start, end): ночь последнего дня поездки
 * обычно уже дома/в дороге, поэтому её не считаем «дырой». Диапазон ограничен
 * 400 сутками — защита от кривых дат (endDate из прошлого века и т.п.).
 */
export function findLodgingGaps(
  list: Pick<Lodging, "checkIn" | "checkOut">[],
  startKey: string,
  endKey: string
): LodgingGap[] {
  const total = daysBetween(startKey, endKey);
  if (!(total > 0) || total > 400) return [];
  const ranges = list.map((l) => [toDateKey(l.checkIn), toDateKey(l.checkOut)] as const);
  const covered = (key: string) => ranges.some(([a, b]) => (a === b ? key === a : key >= a && key < b));

  const gaps: LodgingGap[] = [];
  let open: string | null = null;
  for (let i = 0; i < total; i++) {
    const key = addDaysKey(startKey, i);
    if (!covered(key)) {
      if (!open) open = key;
    } else if (open) {
      gaps.push({ fromKey: open, toKey: key, nights: daysBetween(open, key) });
      open = null;
    }
  }
  if (open) gaps.push({ fromKey: open, toKey: endKey, nights: daysBetween(open, endKey) });
  return gaps;
}

/** id проживаний, чьи ночи пересекаются с другим проживанием (двойная бронь). */
export function findOverlaps(list: Pick<Lodging, "id" | "checkIn" | "checkOut">[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = [toDateKey(list[i].checkIn), toDateKey(list[i].checkOut)] as const;
      const b = [toDateKey(list[j].checkIn), toDateKey(list[j].checkOut)] as const;
      // Полуинтервалы [in, out): встык (выезд = заезд другого) — не пересечение
      if (a[0] < b[1] && b[0] < a[1]) {
        out.add(list[i].id);
        out.add(list[j].id);
      }
    }
  }
  return out;
}

// === Форматирование ===

const dayMonth = (key: string) =>
  new Date(`${key}T12:00:00.000Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });

export function formatStayRange(l: Pick<Lodging, "checkIn" | "checkOut">): string {
  const a = toDateKey(l.checkIn);
  const b = toDateKey(l.checkOut);
  return a === b ? dayMonth(a) : `${dayMonth(a)} – ${dayMonth(b)}`;
}

export const formatDayMonth = dayMonth;

/** tel:-ссылка из свободно набранного номера; null — цифр слишком мало. */
export function phoneHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 5 ? `tel:${digits}` : null;
}

// === Нормализатор входа API ===

/** Поля записи в БД (даты уже Date). */
export interface LodgingWrite {
  name?: string;
  nameLocal?: string | null;
  city?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  checkIn?: Date;
  checkOut?: Date;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  bookingRef?: string | null;
  bookingUrl?: string | null;
  phone?: string | null;
  price?: number | null;
  notes?: string | null;
}

export type LodgingParse = { ok: true; data: LodgingWrite } | { ok: false; error: string };

const CAPS = { name: 200, nameLocal: 200, city: 100, address: 400, bookingRef: 100, bookingUrl: 500, phone: 40, notes: 2000 } as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE_RE = /^[\d\s()+\-.]{3,40}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Нормализует тело POST/PATCH: оставляет известные поля, режет длины, пустые строки
 * в nullable-полях → null. Невалидное значение — ошибка (а не молчаливое «пропустили»),
 * потому что здесь это ввод человека из формы, и ему надо сказать, что не так.
 * create: name, checkIn и checkOut обязательны; PATCH — только присланные поля.
 */
export function pickLodgingInput(body: unknown, mode: "create" | "patch"): LodgingParse {
  if (!isObj(body)) return { ok: false, error: "invalid body" };
  const out: LodgingWrite = {};

  const str = (k: keyof typeof CAPS): string | null | undefined => {
    if (!(k in body)) return undefined;
    const v = body[k];
    if (v === null) return null;
    if (typeof v !== "string") throw new Error(`${k}: ожидается строка`);
    return v.trim().slice(0, CAPS[k]) || null;
  };

  try {
    if ("name" in body || mode === "create") {
      const name = str("name");
      if (!name) return { ok: false, error: "Укажи название жилья" };
      out.name = name;
    }
    for (const k of ["nameLocal", "city", "address", "bookingRef", "notes"] as const) {
      const v = str(k);
      if (v !== undefined) out[k] = v;
    }

    const url = str("bookingUrl");
    if (url !== undefined) {
      // Только http(s): ссылка рисуется как <a href>, javascript: тут недопустим
      if (url && !/^https?:\/\//i.test(url)) return { ok: false, error: "Ссылка на бронь должна начинаться с http(s)://" };
      out.bookingUrl = url;
    }

    const phone = str("phone");
    if (phone !== undefined) {
      if (phone && !PHONE_RE.test(phone)) return { ok: false, error: "Телефон: только цифры, +, пробелы и скобки" };
      out.phone = phone;
    }

    for (const k of ["checkInTime", "checkOutTime"] as const) {
      if (!(k in body)) continue;
      const v = body[k];
      if (v === null || v === "") out[k] = null;
      else if (typeof v === "string" && TIME_RE.test(v)) out[k] = v;
      else return { ok: false, error: "Время — в формате ЧЧ:ММ" };
    }

    for (const k of ["checkIn", "checkOut"] as const) {
      if (!(k in body)) {
        if (mode === "create") return { ok: false, error: "Укажи даты заезда и выезда" };
        continue;
      }
      const d = typeof body[k] === "string" ? keyToStoredDate(body[k] as string) : null;
      if (!d) return { ok: false, error: "Дата — в формате ГГГГ-ММ-ДД" };
      out[k] = d;
    }
    if (out.checkIn && out.checkOut && out.checkOut < out.checkIn) {
      return { ok: false, error: "Выезд не может быть раньше заезда" };
    }

    for (const k of ["lat", "lng"] as const) {
      if (!(k in body)) continue;
      const v = body[k];
      const lim = k === "lat" ? 90 : 180;
      if (v === null) out[k] = null;
      else if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim) out[k] = v;
      else return { ok: false, error: "Координаты вне допустимого диапазона" };
    }

    if ("price" in body) {
      const v = body.price;
      if (v === null) out.price = null;
      else if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_LODGING_PRICE) out.price = v;
      else return { ok: false, error: `Цена — число от 0 до ${MAX_LODGING_PRICE}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid body" };
  }

  return { ok: true, data: out };
}
