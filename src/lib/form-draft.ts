// Черновики форм быстрого добавления (трата, заметка). Случайный тап по фону шита,
// свайп приложения из многозадачности или перезагрузка вкладки не должны стоить юзеру
// набранного текста: поля пишутся в localStorage и возвращаются при следующем открытии.
// Хранилище — только удобство: всё обёрнуто в try/catch (приватный режим, квота),
// без него форма просто работает как раньше.

export const DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const PREFIX = "tt-draft:";

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): DraftStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // доступ к localStorage сам может бросить (заблокированные куки)
  }
}

/** Черновик привязан к поездке и юзеру: на общем телефоне чужие наброски не всплывают. */
export function draftKey(kind: "expense" | "journal", tripId: string, userId: string): string {
  return `${PREFIX}${kind}:${tripId}:${userId}`;
}

export function readDraft<T>(key: string, storage: DraftStorage | null = defaultStorage(), now = Date.now()): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; data?: unknown };
    if (typeof parsed.savedAt !== "number" || now - parsed.savedAt > DRAFT_TTL_MS || parsed.data == null) {
      storage.removeItem(key);
      return null;
    }
    return parsed.data as T;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, data: T, storage: DraftStorage | null = defaultStorage(), now = Date.now()): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ savedAt: now, data }));
  } catch {
    // квота или приватный режим: потеряем черновик, но не форму
  }
}

export function clearDraft(key: string, storage: DraftStorage | null = defaultStorage()): void {
  try {
    storage?.removeItem(key);
  } catch {
    // см. выше
  }
}

export function hasDraft(key: string, storage: DraftStorage | null = defaultStorage(), now = Date.now()): boolean {
  return readDraft(key, storage, now) !== null;
}
