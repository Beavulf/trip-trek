// Эвристика «связь слабая или включена экономия трафика» (Network Information API).
// Он есть в Chromium (Android, десктоп); iOS Safari его не отдаёт — тогда false и всё
// работает как раньше. Используется, чтобы не предзагружать соседние фото лайтбокса там,
// где каждый лишний файл стоит секунд ожидания и мегабайт тарифа.

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

export function isSlowConnection(conn?: NetworkInformationLike | null): boolean {
  const c =
    conn !== undefined
      ? conn
      : typeof navigator !== "undefined"
        ? (navigator as Navigator & { connection?: NetworkInformationLike }).connection
        : null;
  if (!c) return false;
  return !!c.saveData || c.effectiveType === "slow-2g" || c.effectiveType === "2g" || c.effectiveType === "3g";
}
