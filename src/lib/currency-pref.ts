// Запомненная валюта трат — строго scoped по поездке: выбор из одной поездки
// не должен подставляться в другие (раньше был глобальный ключ triptrek-currency).
export function currencyPrefKey(tripId: string) {
  return `triptrek-currency:${tripId}`;
}

export function getSavedCurrency(tripId: string | null | undefined): string | null {
  if (typeof window === "undefined" || !tripId) return null;
  return localStorage.getItem(currencyPrefKey(tripId));
}

export function saveCurrency(tripId: string | null | undefined, code: string) {
  if (typeof window === "undefined" || !tripId) return;
  localStorage.setItem(currencyPrefKey(tripId), code);
}

export function clearSavedCurrency(tripId: string | null | undefined) {
  if (typeof window === "undefined" || !tripId) return;
  localStorage.removeItem(currencyPrefKey(tripId));
}
