// Поддержка проекта (донаты): реквизиты задаются в админке и показываются внизу профиля.
// Чистые функции без БД и next/* — их читают и сервер (валидация настроек), и клиент (карточка).
// Платежи принимают сторонние сервисы; приложение не получает и не хранит платёжных данных.

export interface SupportOptions {
  /** Страница DonationAlerts (https) или null */
  donationAlertsUrl: string | null;
  /** WMZ-кошелёк WebMoney (Z + 12 цифр) или null */
  webmoneyPurse: string | null;
}

/** Ссылка на страницу доната: только https и разумной длины; иначе null (кнопка не показывается). */
export function normalizeDonationUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v || v.length > 200 || !/^https:\/\//i.test(v)) return null;
  try {
    const u = new URL(v);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** WMZ-кошелёк: латинская Z и 12 цифр (в любом регистре, пробелы по краям), приводится к верхнему регистру. */
export function normalizeWmzPurse(raw: string | null | undefined): string | null {
  const v = raw?.trim().toUpperCase();
  return v && /^Z\d{12}$/.test(v) ? v : null;
}

export function hasSupportOptions(o: SupportOptions | null | undefined): o is SupportOptions {
  return !!o && (!!o.donationAlertsUrl || !!o.webmoneyPurse);
}
