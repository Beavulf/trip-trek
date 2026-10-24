// Куда вернуть пользователя после входа (?callbackUrl=…). Параметр приходит из ссылки, то есть от
// кого угодно, поэтому уводить можно только на путь внутри нашего сайта.
// Проверка по префиксу «/…, но не //…» недостаточна: браузер считает обратный слэш обычным
// (`/\evil.com` → https://evil.com), а табуляцию и перевод строки внутри адреса выбрасывает
// (`/<TAB>/evil.com` → //evil.com). Поэтому адрес разбирается так же, как это сделает браузер:
// относительно нашего origin, и принимается, только если origin не изменился.

const FALLBACK = "/";
// Любой origin подойдёт: нам важно лишь, что результат разбора остался на нём
const BASE = "http://trip.invalid";

export function safeCallback(raw: string | null | undefined): string {
  if (!raw || raw[0] !== "/") return FALLBACK;
  // Обратный слэш, пробелы и управляющие символы в пути для нас не нужны — отсекаем до разбора
  if (/[\\\s\u0000-\u001f\u007f]/.test(raw)) return FALLBACK;
  try {
    const u = new URL(raw, BASE);
    if (u.origin !== BASE) return FALLBACK;
    const out = `${u.pathname}${u.search}${u.hash}`;
    // Нормализация точек может сама собрать «//…» (`/.//evil.com` → `//evil.com`) — это снова чужой хост
    return out.startsWith("//") ? FALLBACK : out;
  } catch {
    return FALLBACK;
  }
}
