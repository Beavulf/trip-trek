// Режим техработ и баннер-объявление (поля AppSettings.maintenance* / announcement).
// Чистая логика без БД и Next — её используют и серверный гейт (server/maintenance-gate.ts),
// и API, и тесты. Состояние и кэш — в server/maintenance-state.ts.

export const NOTICE_MAX_LENGTH = 300;

export const MAINTENANCE_DEFAULT_MESSAGE =
  "Обновляем TripTrek. Это займёт несколько минут — страница обновится сама, как только всё заработает.";

/** Текст объявления/заглушки из админки: схлопнутые пробелы, не длиннее лимита; пусто → null. */
export function normalizeNotice(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, NOTICE_MAX_LENGTH);
  return text || null;
}

/** Состояние для клиента: GET /api/app-status. */
export interface SiteStatus {
  maintenance: boolean;
  /** Текст заглушки (стандартный, если админ не написал свой); null, когда техработ нет. */
  message: string | null;
  announcement: string | null;
  /** Зритель — админ: ему приложение остаётся доступным и в режиме техработ. */
  admin: boolean;
}

/**
 * Пути, которые доступны всем даже в режиме техработ:
 *  - healthcheck и статус (Docker, мониторинг, баннер на клиенте);
 *  - вход: страница /login и POST custom-login (сам роут пускает только админа — иначе
 *    админ не смог бы зайти и выключить режим); выход тоже открыт;
 *  - служебная статика (_next, файлы с расширением: sw.js, иконки, manifest);
 *  - витрина и юридические страницы (/landing, /privacy).
 */
export function isMaintenanceExempt(pathname: string): boolean {
  if (pathname === "/api/health" || pathname === "/api/app-status") return true;
  if (pathname === "/api/auth/custom-login" || pathname === "/api/auth/custom-signout") return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/landing" || pathname.startsWith("/landing/")) return true;
  if (pathname === "/privacy") return true;
  // Файлы из public/ (sw.js, manifest.webmanifest, иконки). /api/* сюда не попадает: у API расширений нет
  if (!pathname.startsWith("/api/") && /\.[a-z0-9]{2,12}$/i.test(pathname)) return true;
  return false;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** Заглушка для страниц: самодостаточный HTML без JS-бандла, сама перезагружается раз в 20 секунд. */
export function maintenanceHtml(message: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="20">
<meta name="robots" content="noindex">
<title>Технические работы — TripTrek</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:#0b1220;color:#e8edf7;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  main{max-width:420px;text-align:center}
  .icon{font-size:48px;line-height:1}
  h1{margin:16px 0 8px;font-size:22px}
  p{margin:0;color:#a9b4c9;line-height:1.55;font-size:15px}
  small{display:block;margin-top:20px;color:#6f7b92;font-size:12px}
</style>
</head>
<body>
<main>
  <div class="icon" aria-hidden="true">🛠️</div>
  <h1>Технические работы</h1>
  <p>${escapeHtml(message)}</p>
  <small>Ваши данные в безопасности. Страница обновится сама.</small>
</main>
</body>
</html>`;
}
