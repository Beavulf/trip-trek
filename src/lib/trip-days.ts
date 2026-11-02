import { addDaysKey, daysBetween, keyToStoredDate, localTodayKey, toDateKey } from "./lodging";

// Shared helper для вычисления текущего дня поездки.
// P1 #6: раньше в api/trip/route.ts была формула floor+UTC,
// а в api/ai-summary/route.ts — ceil+ms. Расхождение давало разные номера дней.
// 0 = поездка ещё не началась: кламп в 1 рисовал «Сегодня» на первом дне
// (и «Прошёл» на прошедших) задолго до старта — сессия 2026-09-19.
export function calculateCurrentDayNumber(startDate: Date | string, totalDays: number, now?: Date): number {
  const diffDays = tripDaysElapsed(startDate, now);
  if (diffDays < 0) return 0;
  return Math.min(totalDays, diffDays + 1);
}

/**
 * Календарный день даты поездки или дня маршрута. В БД это полночь UTC выбранного дня (конец
 * поездки — 23:59 UTC), поэтому день читается из самого значения, а не через пояс устройства:
 * иначе конец поездки в Китае уезжал на следующие сутки, а старт в Америке — на предыдущие.
 */
export const tripDateKey = (v: Date | string): string => toDateKey(new Date(v));

/**
 * Подпись календарного дня поездки («8 окт.», «19 октября»). Пояс UTC обязателен по той же причине,
 * что и в tripDateKey: в поясе устройства конец поездки (23:59 UTC) в Минске и Китае показывался
 * следующим числом, а старт (00:00 UTC) в Америке — предыдущим.
 */
export function formatTripDate(
  v: Date | string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
): string {
  return new Date(v).toLocaleDateString("ru-RU", { ...opts, timeZone: "UTC" });
}

/**
 * «Сегодня», присланное устройством, для серверных расчётов: часы сервера в UTC, а день у человека
 * свой. Верим не дальше суток от UTC-даты: это разница поясов, а не способ подделать дату.
 */
export function trustedTodayKey(claimed: unknown, now: Date = new Date()): string {
  const utc = toDateKey(now);
  if (typeof claimed !== "string" || !keyToStoredDate(claimed)) return utc;
  return Math.abs(daysBetween(utc, claimed)) <= 1 ? claimed : utc;
}

/**
 * Сколько календарных суток прошло от старта поездки до сегодня: <0 — поездка ещё не началась,
 * ≥totalDays — уже закончилась. БЕЗ клампа — единая математика для номера дня и «осталось дней».
 * «Сегодня» — по часам устройства: со сравнением по UTC в Китае до 08:00 шёл вчерашний день.
 * На сервере часы в UTC, поэтому клиент пересчитывает номер дня сам (см. hooks/trip/use-trip).
 */
export function tripDaysElapsed(startDate: Date | string, now: Date = new Date()): number {
  return daysBetween(tripDateKey(startDate), localTodayKey(now));
}

/** Первый и последний календарные дни поездки */
export function tripRangeKeys(s: {
  startDate: Date | string;
  endDate?: Date | string | null;
  totalDays: number;
}): { startKey: string; lastKey: string } {
  const startKey = tripDateKey(s.startDate);
  return { startKey, lastKey: s.endDate ? tripDateKey(s.endDate) : addDaysKey(startKey, Math.max(s.totalDays - 1, 0)) };
}

/**
 * Дней поездки осталось (включая сегодня). До старта — все дни; после финиша или у завершённой
 * поездки — null (темп трат не показываем).
 */
export function daysLeftInTrip(startDate: Date | string, totalDays: number, status?: string | null, now?: Date): number | null {
  if (status === "completed" || totalDays <= 0) return null;
  const elapsed = tripDaysElapsed(startDate, now);
  if (elapsed >= totalDays) return null;
  return elapsed < 0 ? totalDays : totalDays - elapsed;
}

/**
 * Трата внесена ДО старта поездки (билеты, брони)? Сравниваем календарные даты, а не мгновения:
 * старт — полночь UTC, и в Китае (UTC+8) трата в 06:00 первого утра раньше считалась «до поездки».
 * Дата траты — по часовому поясу устройства (кто смотрит), дата старта — как везде в trip-days (UTC).
 */
export function isBeforeTripStart(at: string | Date, startDate: string | Date): boolean {
  const start = new Date(startDate);
  const startKey = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const t = new Date(at);
  const atKey = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return atKey < startKey;
}

/**
 * Дата дня N маршрута — каноническая формула: старт поездки + (N−1) суток, полночь UTC.
 * Единая для всех путей создания дней («Добавить день», синхронизация в редакторе дат),
 * чтобы день 1 всегда совпадал с датой старта, а соседние дни не зависели от дат друг друга.
 * UTC явно, а не часы процесса: календарный день не должен зависеть от пояса контейнера.
 */
export function dayDateFor(startDate: Date, dayNumber: number): Date {
  const d = new Date(startDate);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + (dayNumber - 1));
  return d;
}

/** Конец дня N (23:59:59.999) — каноническое значение endDate поездки. */
export function dayEndFor(startDate: Date, dayNumber: number): Date {
  const d = dayDateFor(startDate, dayNumber);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * День маршрута по дате-времени (съёмки) — для автокладки вечернего батча фото:
 * EXIF-дата снимка кладёт фото в день, на чью календарную дату пришлась съёмка.
 * Снимок читаем по часам устройства: EXIF-время — локальное время камеры, а батч грузит тот,
 * кто снимал. День маршрута — календарный (tripDateKey): в поясе устройства в Америке он уезжал
 * на сутки назад, и снимок ложился в следующий день. Нет совпадения (до/после поездки) → null.
 */
export function dayIdForDate(
  days: ReadonlyArray<{ id: string; date: string | Date }>,
  takenAt: Date
): string | null {
  const wanted = localTodayKey(takenAt);
  return days.find((d) => tripDateKey(d.date) === wanted)?.id ?? null;
}

/**
 * Календарный конец поездки уже прошёл. calculateCurrentDayNumber зажимает номер дня
 * в totalDays, поэтому после финиша «текущим» навсегда остаётся последний день —
 * подписи «сегодня» на нём гасим этим флагом (сам кламп нужен формам как дефолтный день).
 */
export function isTripOver(endDate: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!endDate) return false;
  return tripDateKey(endDate) < localTodayKey(now);
}

/**
 * Поездка «закончилась, но не закрыта»: endDate уже прошёл, а статус ещё не
 * completed. Триггер баннера-финала с долгами и архивированием (ретро-кейс
 * 2026-10: поездка в Китай висела в planning через день после возвращения,
 * с незакрытым хвостом долгов, который никто не увидел).
 */
export function isTripFinished(
  endDate: string | Date | null | undefined,
  status?: string | null
): boolean {
  if (status === "completed") return false;
  return isTripOver(endDate);
}

/** Предел числа дней при создании поездки «с нуля»: форма даёт десятки, но не тысячи. */
export const MAX_INITIAL_DAYS = 60;

/**
 * Дни новой поездки «с нуля». Раньше создавалась поездка без дней: «Дней: 12» из формы нигде не
 * хранилось, кнопка «+» отвечала «Нет дней в маршруте», а первый «Добавить день» ставил totalDays=1.
 * Теперь дни есть сразу: город — направление, даты — от старта (каноническая формула dayDateFor).
 */
export function buildInitialDays(startDate: Date, totalDays: number, destination: string) {
  const n = Math.min(MAX_INITIAL_DAYS, Math.max(1, Math.floor(Number(totalDays)) || 1));
  const city = destination.trim() ? destination.trim().slice(0, 100) : "Направление";
  return Array.from({ length: n }, (_, i) => ({
    dayNumber: i + 1,
    date: dayDateFor(startDate, i + 1),
    city,
    cityKey: "custom",
    title: `День ${i + 1}`,
    summary: "",
    accentColor: "#f97316",
  }));
}
