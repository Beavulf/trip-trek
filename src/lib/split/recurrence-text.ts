import { dayLabel } from "./dates";
import { nextOccurrence } from "./recurrence";

// Человеческие подписи повторяющихся трат — чистые функции (тесты рядом).

const ordinal = (day: number) => `${day}-го числа`;

/** «Каждого месяца 5-го числа» + что будет дальше. */
export function recurrenceHint(dayOfMonth: number, startsOn: string, todayKey: string): string {
  const base = `Каждого месяца ${ordinal(dayOfMonth)}`;
  const short = dayOfMonth >= 29 ? " (в коротком месяце — в последний день)" : "";
  const next = nextOccurrence({ dayOfMonth, startsOn, endsOn: null }, todayKey);
  const tail = next ? ` · следующая — ${dayLabel(next, todayKey)}` : "";
  return `${base}${short}${tail}`;
}

/** Подпись шаблона в списке: «5-го числа · следующая 5 ноября» / «на паузе». */
export function recurringLine(
  rule: { dayOfMonth: number; startsOn: string; endsOn: string | null; active: boolean },
  todayKey: string
): string {
  if (!rule.active) return `${ordinal(rule.dayOfMonth)} · на паузе`;
  const next = nextOccurrence(rule, todayKey);
  return next ? `${ordinal(rule.dayOfMonth)} · следующая — ${dayLabel(next, todayKey)}` : `${ordinal(rule.dayOfMonth)} · закончилась`;
}
