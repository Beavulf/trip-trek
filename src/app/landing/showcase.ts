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


// ── Временный редирект «первый визит → лендинг» ────────────────────────────────────────────────
// Включается переменной LANDING_REDIRECT=1 в .env (читается в рантайме: `docker compose up -d app`,
// пересборка не нужна). Убрали переменную — всё как раньше: гость видит форму входа.

/** Метка «лендинг уже показывали на этом устройстве». Ставят лендинг и выход из аккаунта. */
export const LANDING_SEEN_COOKIE = "tt_seen";

export function isLandingRedirectEnabled(raw: string | null | undefined): boolean {
  return ["1", "true", "on", "yes"].includes((raw ?? "").trim().toLowerCase());
}

/**
 * Куда отправить гостя, открывшего /login: адрес лендинга с теми же параметрами (`code`, `utm_*`
 * доезжают до регистрации) или null — показывать форму входа.
 * Не трогаем: вошедших; тех, кто лендинг уже видел; и любой «осознанный» заход на форму —
 * `mode` (кнопки лендинга «Войти»/«Создать аккаунт»; без этого выключенные cookie дали бы петлю
 * лендинг → вход → лендинг) и `callbackUrl` (сессия истекла, человек шёл в конкретное место).
 */
export function landingRedirectTarget(opts: {
  enabled: boolean;
  hasSession: boolean;
  seen: boolean;
  params: Record<string, string | string[] | undefined>;
}): string | null {
  const { enabled, hasSession, seen, params } = opts;
  if (!enabled || hasSession || seen) return null;
  if (params.mode !== undefined || params.callbackUrl !== undefined) return null;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    for (const item of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, item);
  }
  const q = qs.toString();
  return q ? `/landing?${q}` : "/landing";
}
