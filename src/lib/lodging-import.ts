// Перенос отелей из маршрута в «Жильё»: чистая логика предложения. До появления вкладки жильё
// вели местами категории hotel, и записи там — не проживания, а события дня. В реальной поездке:
// «Отель East Maple» в день 1, «ВЫСЕЛЕНИЕ» в день 5 и «ЗАСЕЛЕНИЕ» в тот же день, причём у пары
// «заселение/выселение» бывают разные координаты или разный адрес. Поэтому склеиваем не по имени,
// а идём по маршруту подряд и сравниваем запись с открытым проживанием: точка, адрес, название.

import { TIME_SLOTS } from "./time-of-day";
import { addDaysKey, toDateKey } from "./lodging";

/** Ближе этого считаем одной точкой: геокодер кладёт вход и подъезд рядом, но не точно */
const SAME_POINT_M = 300;
const ADDRESS_PREFIX = 30;

// Такое «название» говорит о действии или типе жилья, а не о конкретном отеле
const GENERIC_NAME =
  /^(заселени[ея]|заселяемся|заезд|выселени[ея]|выселяемся|выезд|check[\s-]?in|check[\s-]?out|отель|хотел|гостиница|хостел|жильё|жилье|апартаменты|hotel|hostel)$/i;
const CHECKOUT_NAME = /выселен|выселя|выезд|check[\s-]?out/i;
// Письменность не для нашего языка: такое название поймёт водитель, а не мы
const LOCAL_SCRIPT = /[^\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]/u;

export interface HotelPlaceInput {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address: string | null;
  budget: number | null;
  timeOfDay: string | null;
  lodgingId?: string | null;
}

export interface RouteDayInput {
  dayNumber: number;
  date: string;
  city: string;
  places: HotelPlaceInput[];
}

export interface ExistingLodging {
  id: string;
  name: string;
}

/** Предложенное проживание: человек проверяет его в окне переноса и только потом сохраняет */
export interface StayProposal {
  /** Устойчивый ключ строки в окне: id первой записи */
  key: string;
  /** Места маршрута, которые войдут в проживание */
  placeIds: string[];
  /** Уже есть жильё с таким названием: привязываем к нему, а не создаём дубль */
  lodgingId: string | null;
  name: string;
  nameLocal: string | null;
  city: string | null;
  address: string | null;
  lat: number;
  lng: number;
  checkIn: string;
  checkOut: string;
  price: number | null;
}

interface Entry extends HotelPlaceInput {
  dayNumber: number;
  dateKey: string;
  city: string;
}

interface OpenStay {
  entries: Entry[];
  closed: boolean;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const isGeneric = (name: string) => GENERIC_NAME.test(name.trim());
const firstSegment = (address: string | null) => address?.split(",")[0]?.trim() || "";

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function sameHotel(a: Entry, b: Entry): boolean {
  if (metersBetween(a, b) <= SAME_POINT_M) return true;
  if (a.address && b.address && norm(a.address).slice(0, ADDRESS_PREFIX) === norm(b.address).slice(0, ADDRESS_PREFIX)) return true;
  return !isGeneric(a.name) && !isGeneric(b.name) && norm(a.name) === norm(b.name);
}

const slotRank = (slot: string | null) => {
  const i = TIME_SLOTS.findIndex((s) => s.key === slot);
  return i === -1 ? TIME_SLOTS.length : i;
};

function nameOf(entries: Entry[]): string {
  const real = entries.find((e) => !isGeneric(e.name));
  return real?.name.trim() || entries.map((e) => firstSegment(e.address)).find(Boolean) || entries[0].name.trim();
}

function localNameOf(entries: Entry[], name: string): string | null {
  const local = entries.map((e) => firstSegment(e.address)).find((s) => LOCAL_SCRIPT.test(s));
  return local && norm(local) !== norm(name) ? local : null;
}

function priceOf(entries: Entry[]): number | null {
  const cents = entries.reduce((s, e) => s + (e.budget && e.budget > 0 ? Math.round(e.budget * 100) : 0), 0);
  return cents > 0 ? cents / 100 : null;
}

/** Идём по маршруту подряд: запись продолжает открытое проживание или начинает новое */
function collectStays(entries: Entry[]): OpenStay[] {
  const stays: OpenStay[] = [];
  let open: OpenStay | null = null;
  for (const e of entries) {
    const checkout = CHECKOUT_NAME.test(e.name);
    // «Выселение» относится к открытому проживанию, даже если геокодер дал ему другую точку
    if (open && (checkout || sameHotel(open.entries[0], e) || open.entries.some((x) => sameHotel(x, e)))) {
      open.entries.push(e);
      if (checkout) {
        open.closed = true;
        open = null;
      }
      continue;
    }
    const stay: OpenStay = { entries: [e], closed: false };
    stays.push(stay);
    open = checkout ? null : stay;
  }
  return stays;
}

/**
 * Предложение проживаний из мест категории hotel, которые ещё не привязаны к жилью.
 * Заезд — день первой записи, выезд — день последней; если запись одна, выезд — день следующего
 * проживания или конец поездки. Даты здесь лишь догадка: их подтверждает человек.
 */
export function proposeStays(days: RouteDayInput[], lodgings: ExistingLodging[], lastKey: string): StayProposal[] {
  const entries: Entry[] = days
    .flatMap((d) =>
      d.places
        .filter((p) => p.category === "hotel" && !p.lodgingId)
        .map((p) => ({ ...p, dayNumber: d.dayNumber, dateKey: toDateKey(d.date), city: d.city }))
    )
    .sort((a, b) => a.dayNumber - b.dayNumber || slotRank(a.timeOfDay) - slotRank(b.timeOfDay));

  const stays = collectStays(entries);
  const byName = new Map(lodgings.map((l) => [norm(l.name), l.id]));

  return stays.map((stay, i) => {
    const first = stay.entries[0];
    const last = stay.entries[stay.entries.length - 1];
    const nextStart = stays[i + 1]?.entries[0].dateKey;
    const openEnded = !stay.closed && last.dateKey === first.dateKey;
    const end = openEnded ? (nextStart ?? lastKey) : last.dateKey;
    const name = nameOf(stay.entries);
    return {
      key: first.id,
      placeIds: stay.entries.map((e) => e.id),
      lodgingId: byName.get(norm(name)) ?? null,
      name: name.slice(0, 200),
      nameLocal: localNameOf(stay.entries, name),
      city: first.city || null,
      address: stay.entries.find((e) => e.address)?.address ?? null,
      lat: first.lat,
      lng: first.lng,
      checkIn: first.dateKey,
      checkOut: end > first.dateKey ? end : addDaysKey(first.dateKey, 1),
      price: priceOf(stay.entries),
    };
  });
}
