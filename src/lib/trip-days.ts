// Shared helper для вычисления текущего дня поездки.
// P1 #6: раньше в api/trip/route.ts была формула floor+UTC,
// а в api/ai-summary/route.ts — ceil+ms. Расхождение давало разные номера дней.
// 0 = поездка ещё не началась: кламп в 1 рисовал «Сегодня» на первом дне
// (и «Прошёл» на прошедших) задолго до старта — сессия 2026-09-19.
export function calculateCurrentDayNumber(startDate: Date, totalDays: number): number {
  const diffDays = tripDaysElapsed(startDate);
  if (diffDays < 0) return 0;
  return Math.min(totalDays, diffDays + 1);
}

/**
 * Сколько календарных суток (по UTC, без времени суток) прошло от старта поездки до сегодня:
 * <0 — поездка ещё не началась, ≥totalDays — уже закончилась. БЕЗ клампа — единая математика
 * для номера дня и «осталось дней» (раньше Budget.tsx держал свою копию формулы).
 */
export function tripDaysElapsed(startDate: Date | string, now: Date = new Date()): number {
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = new Date(startDate);
  const startUTC = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  return Math.floor((nowUTC - startUTC) / (1000 * 60 * 60 * 24));
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
 * Дата дня N маршрута — каноническая формула: старт поездки + (N−1) суток, локальная полночь.
 * Единая для всех путей создания дней («Добавить день», синхронизация в редакторе дат),
 * чтобы день 1 всегда совпадал с датой старта, а соседние дни не зависели от дат друг друга.
 */
export function dayDateFor(startDate: Date, dayNumber: number): Date {
  const d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (dayNumber - 1));
  return d;
}

/** Конец дня N (23:59:59.999) — каноническое значение endDate поездки. */
export function dayEndFor(startDate: Date, dayNumber: number): Date {
  const d = dayDateFor(startDate, dayNumber);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * День маршрута по дате-времени (съёмки) — для автокладки вечернего батча фото:
 * EXIF-дата снимка кладёт фото в день, на чью календарную дату пришлась съёмка.
 * Сравнение по локальной дате устройства: EXIF-время — локальное время камеры,
 * а батч грузит тот, кто снимал. Нет совпадения (снимки до/после поездки) → null.
 */
export function dayIdForDate(
  days: ReadonlyArray<{ id: string; date: string | Date }>,
  takenAt: Date
): string | null {
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const wanted = key(takenAt);
  for (const d of days) {
    if (key(new Date(d.date)) === wanted) return d.id;
  }
  return null;
}

/**
 * Календарный конец поездки уже прошёл. calculateCurrentDayNumber зажимает номер дня
 * в totalDays, поэтому после финиша «текущим» навсегда остаётся последний день —
 * подписи «сегодня» на нём гасим этим флагом (сам кламп нужен формам как дефолтный день).
 */
export function isTripOver(endDate: string | Date | null | undefined): boolean {
  if (!endDate) return false;
  return new Date(endDate).getTime() < Date.now();
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
