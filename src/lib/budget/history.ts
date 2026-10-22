// Группировка истории трат по календарным дням — «Сегодня · $45», «Вчера», «12 октября».
// Дата траты — по часовому поясу устройства (кто смотрит); порядок групп и трат внутри — как во входе.

export interface DayGroup<T> {
  /** Локальная дата ГГГГ-ММ-ДД — стабильный ключ группы */
  key: string;
  /** «Сегодня» / «Вчера» / «12 октября» (с годом, если не текущий) */
  label: string;
  items: T[];
  /** Сумма трат группы; переводы в сумму не входят (это не траты) */
  total: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function dayLabel(d: Date, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function groupByDay<T extends { createdAt: string; category: string; amount: number }>(
  items: T[],
  now: Date = new Date()
): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const d = new Date(item.createdAt);
    // Битая дата не должна ронять список: такие записи уходят в общую группу без даты
    const valid = !Number.isNaN(d.getTime());
    const key = valid ? localKey(d) : "unknown";
    let g = groups.get(key);
    if (!g) {
      g = { key, label: valid ? dayLabel(d, now) : "Без даты", items: [], total: 0 };
      groups.set(key, g);
    }
    g.items.push(item);
    if (item.category !== "settlement") g.total += item.amount;
  }
  return [...groups.values()];
}
