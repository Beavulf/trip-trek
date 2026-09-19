// Shared helper для вычисления текущего дня поездки.
// P1 #6: раньше в api/trip/route.ts была формула floor+UTC,
// а в api/ai-summary/route.ts — ceil+ms. Расхождение давало разные номера дней.
// 0 = поездка ещё не началась: кламп в 1 рисовал «Сегодня» на первом дне
// (и «Прошёл» на прошедших) задолго до старта — сессия 2026-09-19.
export function calculateCurrentDayNumber(startDate: Date, totalDays: number): number {
  const now = new Date();
  // Use date-only comparison (ignore time) in UTC to avoid timezone drift
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startUTC = Date.UTC(
    new Date(startDate).getUTCFullYear(),
    new Date(startDate).getUTCMonth(),
    new Date(startDate).getUTCDate()
  );
  const diffDays = Math.floor((nowUTC - startUTC) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 0;
  return Math.min(totalDays, diffDays + 1);
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
