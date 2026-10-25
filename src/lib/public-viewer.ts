// Чистая логика просмотра публичной страницы `/p/<token>`: где начало и конец дня
// в общем списке фото (для «День 3 · фото 5 из 24», перехода между днями) и
// «место, где гость остановился» (localStorage, чтобы вернуться, не листая заново).

export interface DayIndex {
  /** Индекс первого фото каждого дня в списке */
  startOf: Map<number, number>;
  /** Сколько фото у каждого дня в списке */
  countOf: Map<number, number>;
}

/**
 * Список приходит в порядке поездки (день ↑, время ↑), поэтому фото дня идут подряд;
 * первое вхождение дня = начало дня. Фото без дня (null) в индекс не попадают.
 */
export function buildDayIndex(list: ReadonlyArray<{ dayNumber: number | null }>): DayIndex {
  const startOf = new Map<number, number>();
  const countOf = new Map<number, number>();
  list.forEach((p, i) => {
    if (p.dayNumber == null) return;
    if (!startOf.has(p.dayNumber)) startOf.set(p.dayNumber, i);
    countOf.set(p.dayNumber, (countOf.get(p.dayNumber) ?? 0) + 1);
  });
  return { startOf, countOf };
}

/**
 * Куда прыгнуть кнопкой «день назад / день вперёд» из позиции index.
 * Назад: если ушли вглубь дня — в его начало, иначе в начало предыдущего дня.
 * Вперёд: начало следующего дня. null — прыгать некуда (первый/последний день).
 */
export function dayJumpTarget(
  list: ReadonlyArray<{ dayNumber: number | null }>,
  index: number,
  direction: "prev" | "next"
): number | null {
  const cur = list[index]?.dayNumber;
  if (cur == null) return null;
  const { startOf } = buildDayIndex(list);
  const days = [...startOf.keys()].sort((a, b) => a - b);
  const pos = days.indexOf(cur);
  if (direction === "next") {
    const next = days[pos + 1];
    return next == null ? null : startOf.get(next)!;
  }
  const start = startOf.get(cur)!;
  if (index > start) return start;
  const prev = days[pos - 1];
  return prev == null ? null : startOf.get(prev)!;
}

/** Место, на котором гость остановился: последнее открытое фото либо последний день, до которого долистал */
export type ResumePoint =
  | { kind: "photo"; photoId: string; at: number }
  | { kind: "day"; dayNumber: number; at: number };

/** Через сколько страница перестаёт предлагать «продолжить» — через месяц это уже не «вернуться», а новый заход */
export const RESUME_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const resumeKey = (token: string) => `triptrek:share-pos:${token}`;

/** Разбор сохранённого значения; мусор и протухшее → null (localStorage — недоверенный ввод) */
export function parseResume(raw: string | null, now = Date.now()): ResumePoint | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (!v || typeof v !== "object" || typeof v.at !== "number") return null;
    if (now - v.at > RESUME_TTL_MS) return null;
    if (v.kind === "photo" && typeof v.photoId === "string" && v.photoId) {
      return { kind: "photo", photoId: v.photoId, at: v.at };
    }
    if (v.kind === "day" && typeof v.dayNumber === "number" && Number.isInteger(v.dayNumber) && v.dayNumber > 0) {
      return { kind: "day", dayNumber: v.dayNumber, at: v.at };
    }
    return null;
  } catch {
    return null;
  }
}

export function readResume(token: string): ResumePoint | null {
  try {
    return parseResume(localStorage.getItem(resumeKey(token)));
  } catch {
    return null; // приватный режим без localStorage — «продолжить» просто не предлагаем
  }
}

export function writeResume(token: string, point: ResumePoint): void {
  try {
    localStorage.setItem(resumeKey(token), JSON.stringify(point));
  } catch {
    // не критично: без сохранения страница работает как раньше
  }
}
