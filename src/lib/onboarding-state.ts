// Состояние обучения пользователя. Файл без React и без БД: формат, правила слияния
// и проверка входа — чистые функции с тестами. Хранится на аккаунте (User.onboardingState),
// чтобы прогресс не зависел от устройства; локальная копия в localStorage нужна лишь на время,
// пока запись не дошла до сервера (офлайн/обрыв), и сливается с серверной по времени записей.

/** Сколько id прочитанных обновлений храним (новости — src/lib/updates-content.ts; старые вытесняются) */
export const MAX_UPDATES_READ = 200;

/**
 * done — досмотрели, skipped — пропустили, paused — ушли выполнять шаг (продолжить можно
 * вручную), later — «напомнить позже» (сам откроется с этого шага, когда пауза кончится)
 */
export type TourStatus = "done" | "skipped" | "paused" | "later";

export interface TourProgress {
  status: TourStatus;
  /** Индекс шага, на котором остановились (для paused — откуда продолжать) */
  step: number;
  at: string;
}

export interface OnboardingState {
  tours: Record<string, TourProgress>;
  /** «Напомнить позже»: до этого момента сами подсказки не открываются */
  snoozedUntil: string | null;
  /** «Больше не показывать подсказки»: ручной запуск (кнопка «?», Профиль) работает всегда */
  hintsOff: boolean;
  checklistHidden: boolean;
  /** Прочитанные обновления (id из updates-content.ts); непрочитанные считает updates.ts */
  updatesRead: string[];
  /** Момент «Сбросить всё»: записи о турах старше него — устаревшие (важно при слиянии с копией устройства) */
  resetAt: string | null;
  /** Момент последнего изменения: при слиянии скалярные поля берутся из более свежей копии */
  updatedAt: string | null;
}

export const EMPTY_ONBOARDING_STATE: OnboardingState = {
  tours: {},
  snoozedUntil: null,
  hintsOff: false,
  checklistHidden: false,
  updatesRead: [],
  resetAt: null,
  updatedAt: null,
};

/** Частичное изменение: клиент шлёт его серверу, оно же применяется оптимистично у себя */
export interface OnboardingPatch {
  /** null — убрать запись о туре */
  tours?: Record<string, TourProgress | null>;
  snoozedUntil?: string | null;
  hintsOff?: boolean;
  checklistHidden?: boolean;
  /** Отметить обновления прочитанными (добавляются к уже прочитанным) */
  updatesRead?: string[];
  /** «Сбросить всё»: обнулить прогресс, паузу и скрытый чек-лист; hintsOff тоже снимается */
  reset?: boolean;
}

const TOUR_ID_RE = /^[a-z0-9-]{1,40}$/;
const UPDATE_ID_RE = /^[a-z0-9-]{1,60}$/;
const MAX_PATCH_UPDATES = 50;
const MAX_TOURS = 64;
const MAX_STEP = 50;

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Список id обновлений: только валидные, без дублей, не длиннее лимита (при переполнении остаются последние) */
function sanitizeUpdateIds(v: unknown, limit: number): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  for (const id of v) {
    if (typeof id === "string" && UPDATE_ID_RE.test(id)) seen.add(id);
  }
  return [...seen].slice(-limit);
}

function addUpdateIds(have: string[], add: string[]): string[] {
  return [...new Set([...have, ...add])].slice(-MAX_UPDATES_READ);
}

function sanitizeProgress(v: unknown): TourProgress | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.status !== "done" && o.status !== "skipped" && o.status !== "paused" && o.status !== "later") return null;
  const at = isoOrNull(o.at);
  if (!at) return null;
  const step = typeof o.step === "number" && Number.isFinite(o.step) ? Math.min(MAX_STEP, Math.max(0, Math.floor(o.step))) : 0;
  return { status: o.status, step, at };
}

/** Читает что угодно (JSON из БД, localStorage) и всегда отдаёт валидное состояние */
export function sanitizeState(raw: unknown): OnboardingState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_ONBOARDING_STATE, tours: {} };
  const o = raw as Record<string, unknown>;
  const tours: Record<string, TourProgress> = {};
  if (o.tours && typeof o.tours === "object" && !Array.isArray(o.tours)) {
    for (const [id, p] of Object.entries(o.tours as Record<string, unknown>)) {
      if (!TOUR_ID_RE.test(id)) continue;
      const progress = sanitizeProgress(p);
      if (progress) tours[id] = progress;
      if (Object.keys(tours).length >= MAX_TOURS) break;
    }
  }
  return {
    tours,
    snoozedUntil: isoOrNull(o.snoozedUntil),
    hintsOff: o.hintsOff === true,
    checklistHidden: o.checklistHidden === true,
    updatesRead: sanitizeUpdateIds(o.updatesRead, MAX_UPDATES_READ),
    resetAt: isoOrNull(o.resetAt),
    updatedAt: isoOrNull(o.updatedAt),
  };
}

/** Проверка тела PATCH. null = тело не похоже на патч обучения (или пустое) */
export function sanitizePatch(raw: unknown): OnboardingPatch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const patch: OnboardingPatch = {};
  if (o.tours && typeof o.tours === "object" && !Array.isArray(o.tours)) {
    const tours: Record<string, TourProgress | null> = {};
    for (const [id, p] of Object.entries(o.tours as Record<string, unknown>)) {
      if (!TOUR_ID_RE.test(id)) continue;
      if (p === null) tours[id] = null;
      else {
        const progress = sanitizeProgress(p);
        if (progress) tours[id] = progress;
      }
      if (Object.keys(tours).length >= MAX_TOURS) break;
    }
    if (Object.keys(tours).length > 0) patch.tours = tours;
  }
  if (o.snoozedUntil === null) patch.snoozedUntil = null;
  else if (o.snoozedUntil !== undefined) {
    const t = isoOrNull(o.snoozedUntil);
    if (t) patch.snoozedUntil = t;
  }
  if (typeof o.hintsOff === "boolean") patch.hintsOff = o.hintsOff;
  if (typeof o.checklistHidden === "boolean") patch.checklistHidden = o.checklistHidden;
  const updatesRead = sanitizeUpdateIds(o.updatesRead, MAX_PATCH_UPDATES);
  if (updatesRead.length > 0) patch.updatesRead = updatesRead;
  if (o.reset === true) patch.reset = true;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Применить патч. Чистая: тот же результат на клиенте (оптимистично) и на сервере */
export function applyPatch(state: OnboardingState, patch: OnboardingPatch, now: Date): OnboardingState {
  const nowIso = now.toISOString();
  let next: OnboardingState = { ...state, tours: { ...state.tours } };
  if (patch.reset) {
    next = {
      ...EMPTY_ONBOARDING_STATE,
      tours: {},
      // сброс обучения не возвращает прочитанные новости
      updatesRead: state.updatesRead,
      resetAt: nowIso,
    };
  }
  if (patch.tours) {
    for (const [id, p] of Object.entries(patch.tours)) {
      if (p === null) delete next.tours[id];
      else next.tours[id] = p;
    }
    const ids = Object.keys(next.tours);
    if (ids.length > MAX_TOURS) {
      // держим самые свежие
      ids
        .sort((a, b) => Date.parse(next.tours[a].at) - Date.parse(next.tours[b].at))
        .slice(0, ids.length - MAX_TOURS)
        .forEach((id) => delete next.tours[id]);
    }
  }
  if (patch.snoozedUntil !== undefined) next.snoozedUntil = patch.snoozedUntil;
  if (patch.hintsOff !== undefined) next.hintsOff = patch.hintsOff;
  if (patch.checklistHidden !== undefined) next.checklistHidden = patch.checklistHidden;
  if (patch.updatesRead) next.updatesRead = addUpdateIds(next.updatesRead, patch.updatesRead);
  next.updatedAt = nowIso;
  return next;
}

const ts = (iso: string | null): number => (iso ? Date.parse(iso) : 0);

/**
 * Слить две копии (серверную и локальную). Туры — по времени записи, но записи старше
 * последнего сброса отбрасываются; скаляры — из копии, изменённой позже.
 */
export function mergeStates(a: OnboardingState, b: OnboardingState): OnboardingState {
  const newer = ts(a.updatedAt) >= ts(b.updatedAt) ? a : b;
  const resetAt = ts(a.resetAt) >= ts(b.resetAt) ? a.resetAt : b.resetAt;
  const tours: Record<string, TourProgress> = {};
  for (const src of [a, b]) {
    for (const [id, p] of Object.entries(src.tours)) {
      if (resetAt && ts(p.at) < ts(resetAt)) continue;
      const have = tours[id];
      if (!have || ts(p.at) > ts(have.at)) tours[id] = p;
    }
  }
  return {
    tours,
    snoozedUntil: newer.snoozedUntil,
    hintsOff: newer.hintsOff,
    checklistHidden: newer.checklistHidden,
    updatesRead: addUpdateIds(a.updatesRead, b.updatesRead),
    resetAt,
    updatedAt: newer.updatedAt,
  };
}

export function isTourFinished(state: OnboardingState, id: string): boolean {
  const s = state.tours[id]?.status;
  return s === "done" || s === "skipped";
}

export function isSnoozed(state: OnboardingState, now: number): boolean {
  return state.snoozedUntil !== null && Date.parse(state.snoozedUntil) > now;
}

// === Локальная копия устройства (SSR-safe, переживает private mode) ===

const localKey = (userId: string) => `triptrek-onboarding:${userId}`;
const LEGACY_SEEN_KEY = (userId: string) => `triptrek-tabtour-seen:${userId}`;
const LEGACY_DONE_KEY = (userId: string) => `triptrek-tour-local-done:${userId}`;

export function readLocalState(userId: string | null | undefined): OnboardingState | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    return raw ? sanitizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeLocalState(userId: string | null | undefined, state: OnboardingState): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localKey(userId), JSON.stringify(state));
  } catch {
    // private mode / квота — прогресс останется только на аккаунте, это не страшно
  }
}

/**
 * Старые отметки до появления состояния на аккаунте: «показанные вкладки» и «тур закрыт».
 * Превращаются в записи туров, чтобы после обновления никто не получил обучение заново.
 * Время записи — эпоха: любая новая запись (в т.ч. «Сбросить всё») их перекроет.
 */
export function readLegacyLocalState(userId: string | null | undefined): OnboardingState | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const tours: Record<string, TourProgress> = {};
    const at = new Date(0).toISOString();
    const rawSeen = window.localStorage.getItem(LEGACY_SEEN_KEY(userId));
    if (rawSeen) {
      const parsed: unknown = JSON.parse(rawSeen);
      if (Array.isArray(parsed)) {
        for (const tab of parsed) {
          if (typeof tab === "string" && TOUR_ID_RE.test(tab)) tours[tab] = { status: "done", step: 0, at };
        }
      }
    }
    if (window.localStorage.getItem(LEGACY_DONE_KEY(userId)) === "1") tours.welcome = { status: "done", step: 0, at };
    return Object.keys(tours).length > 0 ? { ...EMPTY_ONBOARDING_STATE, tours } : null;
  } catch {
    return null;
  }
}

export function clearLegacyLocalState(userId: string | null | undefined): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_SEEN_KEY(userId));
    window.localStorage.removeItem(LEGACY_DONE_KEY(userId));
  } catch {
    // нечего делать
  }
}
