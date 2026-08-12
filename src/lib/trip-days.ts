// Shared helper для вычисления текущего дня поездки.
// P1 #6: раньше в api/trip/route.ts была формула floor+UTC,
// а в api/ai-summary/route.ts — ceil+ms. Расхождение давало разные номера дней.
// Теперь единая функция используется в обоих местах.
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
  return Math.max(1, Math.min(totalDays, diffDays + 1));
}
