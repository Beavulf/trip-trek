// Витрина лендинга: что гостю можно показать о режиме приложения (getPublicShowcase) и как
// превратить поля из админки в безопасные ссылки. Чистые функции, без хуков и next/* —
// страницей и тестами пользуется одинаково.

export interface LandingShowcase {
  registrationEnabled: boolean;
  inviteRequired: boolean;
  demoTripToken: string | null;
  contactTelegram: string | null;
}

// Без настроек (предпросмотр, тесты): открытая регистрация без кода, без примера и контакта
export const DEFAULT_SHOWCASE: LandingShowcase = {
  registrationEnabled: true,
  inviteRequired: false,
  demoTripToken: null,
  contactTelegram: null,
};

/**
 * Контакт из админки → ссылка. Админка хранит просто обрезанную строку, поэтому в href идёт
 * только «@имя» (ссылка на t.me) или https-адрес; всё остальное (в том числе javascript:) не
 * превращается в ссылку вовсе — блок контакта просто не показываем.
 */
export function contactLink(raw: string | null | undefined): { href: string; label: string } | null {
  const v = raw?.trim();
  if (!v) return null;
  if (/^@[A-Za-z0-9_]{3,32}$/.test(v)) return { href: `https://t.me/${v.slice(1)}`, label: v };
  if (/^https:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return { href: u.toString(), label: `${u.host}${u.pathname.replace(/\/$/, "")}` };
    } catch {
      return null;
    }
  }
  return null;
}

/** Токен публичной поездки → адрес «живого примера» (`/p/<token>`); пустой токен — примера нет. */
export function demoHref(token: string | null | undefined): string | null {
  const t = token?.trim();
  return t ? `/p/${encodeURIComponent(t)}` : null;
}

/**
 * Код приглашения из ссылки (`/landing?code=…`): в профиле TikTok кликабельна одна ссылка, и код
 * едет в ней, чтобы человек не вводил его руками. Из параметра берём только буквы и цифры
 * (код приложения — 8 знаков), всё остальное — не код и в ссылки дальше не попадает.
 */
export function sanitizeInviteParam(raw: string | string[] | null | undefined): string | null {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return v && /^[A-Za-z0-9]{4,32}$/.test(v) ? v : null;
}

/** Адрес регистрации; с кодом он подставится в поле формы (`/login?code=` уже умеет это). */
export function registerHrefFor(code: string | null): string {
  return code ? `/login?mode=register&code=${encodeURIComponent(code)}` : "/login?mode=register";
}

/**
 * Встроенный браузер соцсети (TikTok, Instagram, Facebook): сайт работает, но «поставить на экран»
 * там нет, а ссылка из ленты открывается именно в нём. Определяем по User-Agent.
 */
export function isInAppBrowser(ua: string | null | undefined): boolean {
  return !!ua && /musical_ly|bytedance|tiktok|instagram|FBAN|FBAV/i.test(ua);
}

