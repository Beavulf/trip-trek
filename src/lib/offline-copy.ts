// Копия данных на устройстве для работы без сети. Сервис-воркер запросы к API не кэширует намеренно
// (нужны свежие данные), а экстренный номер нужен как раз там, где интернета нет. Поэтому чек-лист,
// справку и вошедшего пользователя храним здесь. Это копия для чтения: правки всё равно идут на сервер.

const PREFIX = "tt_offline_";
const USER_KEY = `${PREFIX}user`;

export type OfflineKind = "checklist" | "info";

const copyKey = (kind: OfflineKind, tripId: string) => `${PREFIX}${kind}_${tripId}`;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // доступ к localStorage сам может бросить (заблокирован в настройках браузера)
  }
}

function write(key: string, value: unknown) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // переполнено или запрещено: копии не будет, онлайн это ничего не ломает
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const saveOfflineCopy = (kind: OfflineKind, tripId: string, data: unknown) => write(copyKey(kind, tripId), data);

export const readOfflineCopy = <T>(kind: OfflineKind, tripId: string) => read<T>(copyKey(kind, tripId));

export const saveOfflineUser = (user: unknown) => write(USER_KEY, user);

export const readOfflineUser = <T>() => read<T>(USER_KEY);

/** Сервер сказал, что сессии нет, или человек вышел: на устройстве не остаётся ни его данных, ни входа */
export function clearOfflineData() {
  const s = storage();
  if (!s) return;
  try {
    for (const key of Object.keys(s)) if (key.startsWith(PREFIX)) s.removeItem(key);
  } catch {
    // запрещено: копии всё равно не читаются
  }
}

/**
 * Запрос с запасным вариантом. Только сетевой сбой уходит в копию: ответ сервера с ошибкой (нет прав,
 * поездка удалена) показывать поверх устаревшей копии нельзя.
 */
export async function fetchWithOfflineCopy<T>(kind: OfflineKind, tripId: string, load: () => Promise<Response>, parse: (r: Response) => Promise<T>): Promise<T> {
  let response: Response;
  try {
    response = await load();
  } catch (e) {
    const copy = readOfflineCopy<T>(kind, tripId);
    if (copy !== null) return copy;
    throw e;
  }
  const data = await parse(response);
  saveOfflineCopy(kind, tripId, data);
  return data;
}
