import { addMonths, daysInMonth, monthOf } from "./dates";

// Повторяющиеся траты (аренда, интернет, подписка) — раз в месяц в заданное число.
// Cron нет: при чтении группы сервер создаёт недостающие траты за прошедшие периоды
// (идемпотентно — уникальный (recurringId, recurringPeriod)), см. ADR-0009.

export interface RecurrenceRule {
  dayOfMonth: number;
  startsOn: string;
  endsOn: string | null;
}

export interface DuePeriod {
  /** "2026-10" — ключ идемпотентности */
  period: string;
  /** Дата траты этого периода */
  date: string;
}

/** Предохранитель от «аренда с 2010 года»: за один проход создаём не больше этого числа периодов. */
export const MAX_CATCHUP_PERIODS = 36;
/** Шаблон нельзя завести с началом глубже чем на год назад: иначе пачка старых трат сломает баланс. */
export const MAX_BACKFILL_MONTHS = 12;

const pad = (n: number) => String(n).padStart(2, "0");

/** 31-е в феврале — 28/29-е: «в последний день месяца» ведёт себя предсказуемо. */
export function occurrenceDate(month: string, dayOfMonth: number): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${pad(Math.min(dayOfMonth, daysInMonth(y, m)))}`;
}

/** Все периоды от месяца начала до «сегодня» включительно, чья дата уже наступила. */
export function duePeriods(rule: RecurrenceRule, todayKey: string): DuePeriod[] {
  const result: DuePeriod[] = [];
  const lastMonth = monthOf(todayKey);
  for (let month = monthOf(rule.startsOn); month <= lastMonth; month = addMonths(month, 1)) {
    const date = occurrenceDate(month, rule.dayOfMonth);
    if (date < rule.startsOn) continue;
    if (date > todayKey) break;
    if (rule.endsOn && date > rule.endsOn) break;
    result.push({ period: month, date });
  }
  // Берём самые свежие: старые уже неактуальны, а баланс не должен взорваться
  return result.length > MAX_CATCHUP_PERIODS ? result.slice(-MAX_CATCHUP_PERIODS) : result;
}

/** Ближайшая будущая дата шаблона (для подписи «следующая — 5 ноября»); null — шаблон закончился. */
export function nextOccurrence(rule: RecurrenceRule, todayKey: string): string | null {
  let month = monthOf(todayKey);
  for (let i = 0; i < 14; i++, month = addMonths(month, 1)) {
    const date = occurrenceDate(month, rule.dayOfMonth);
    if (date <= todayKey || date < rule.startsOn) continue;
    if (rule.endsOn && date > rule.endsOn) return null;
    return date;
  }
  return null;
}
