// «Последняя группа» — чтобы частое действие (добавить трату) не требовало выбирать группу каждый раз.
// Хранится в cookie, а не в localStorage: её читает middleware, и `/split` ведёт в группу уже ответом сервера,
// без загрузки хаба и клиентского редиректа. Значение — только id (проверяется шаблоном): доступ к группе
// всё равно проверяет сервер, чужой или протухший id даёт обычное «нет доступа» и cookie стирается.

export const LAST_GROUP_COOKIE = "triptrek-split-last";

const ID_RE = /^[a-z0-9]{16,40}$/; // cuid
export const isGroupId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);

/** Значение cookie из строки заголовка/document.cookie; null — нет или не похоже на id группы. */
export function readCookieGroup(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== LAST_GROUP_COOKIE) continue;
    const v = part.slice(i + 1).trim();
    return isGroupId(v) ? v : null;
  }
  return null;
}

export function readLastGroup(): string | null {
  return typeof document === "undefined" ? null : readCookieGroup(document.cookie);
}

export function rememberLastGroup(groupId: string): void {
  if (typeof document === "undefined" || !isGroupId(groupId)) return;
  if (readLastGroup() === groupId) return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LAST_GROUP_COOKIE}=${groupId}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}

/** Забыть группу (удалили, вышли, исключили). С groupId — только если запомнена именно она. */
export function forgetLastGroup(groupId?: string): void {
  if (typeof document === "undefined") return;
  if (groupId && readLastGroup() !== groupId) return;
  document.cookie = `${LAST_GROUP_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
