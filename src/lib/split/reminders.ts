import { pairDebts, type Debt, type LedgerExpense, type LedgerPayment } from "./balances";
import { formatCents } from "./money";

// Напоминания о долгах (ADR-0010). Чистые правила без БД: кого и когда напомнить, чем отличается ручное
// от автоматического, тексты. Сервер (`reminders-server.ts`) только достаёт данные и шлёт.

/** Сроки автонапоминания, которые владелец может выбрать в настройках группы (дней). */
export const REMIND_AFTER_OPTIONS = [3, 7, 14] as const;

export function isRemindAfterDays(v: unknown): v is (typeof REMIND_AFTER_OPTIONS)[number] {
  return (REMIND_AFTER_OPTIONS as readonly unknown[]).includes(v);
}

/** Ручное напоминание одной и той же паре — не чаще раза в 12 часов: напоминание не должно превращаться в давление. */
export const MANUAL_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/** Долги меньше 1,00 в валюте группы не напоминаем: копейки не стоят уведомления. */
export const MIN_REMIND_CENTS = 100;

/** Окно отправки автонапоминаний по часам должника: ночью пуш никому не нужен (ADR-0010) */
export const AUTO_REMIND_LOCAL_HOURS = { from: 9, to: 21 } as const;

/** Пока устройство не сообщило пояс: большинство пользователей в Беларуси */
export const DEFAULT_REMIND_TIME_ZONE = "Europe/Minsk";

/** Настоящий ли это пояс: значение приходит с устройства */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function inAutoRemindWindow(now: Date, timeZone?: string | null): boolean {
  const zone = isTimeZone(timeZone) ? timeZone : DEFAULT_REMIND_TIME_ZONE;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: zone }).format(now));
  return hour >= AUTO_REMIND_LOCAL_HOURS.from && hour < AUTO_REMIND_LOCAL_HOURS.to;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StampedExpense extends LedgerExpense {
  createdAt: Date;
}
export interface StampedPayment extends LedgerPayment {
  createdAt: Date;
}
export interface PastReminder {
  fromId: string;
  toId: string;
  createdAt: Date;
}

/** Время последнего напоминания этой паре в этом направлении (должник → кредитор). */
export function lastReminderAt(reminders: PastReminder[], fromId: string, toId: string): Date | null {
  let last: Date | null = null;
  for (const r of reminders) {
    if (r.fromId === fromId && r.toId === toId && (!last || r.createdAt > last)) last = r.createdAt;
  }
  return last;
}

/** Сколько ещё ждать до следующего ручного напоминания (мс); 0 — можно прямо сейчас. */
export function manualCooldownLeft(last: Date | null, now: Date): number {
  if (!last) return 0;
  return Math.max(0, last.getTime() + MANUAL_COOLDOWN_MS - now.getTime());
}

/**
 * Кому пора напомнить автоматически. Долг считается «давним», если пара должна и сейчас, и была должна
 * по записям, созданным не позже `now − afterDays` (дата создания записи, а не дата траты: чек, внесённый
 * сегодня задним числом, вчерашний долг не создаёт). Сумма — меньшая из двух: вырос долг только что — о новой
 * части не напоминаем. Повтор — не чаще раза в afterDays, ручное напоминание тоже сбрасывает отсчёт.
 */
export function dueAutoReminders(args: {
  expenses: StampedExpense[];
  payments: StampedPayment[];
  reminders: PastReminder[];
  afterDays: number;
  now: Date;
  /** Можно ли вообще уведомить должника (активный, с аккаунтом) */
  canNotify: (memberId: string) => boolean;
}): Debt[] {
  const cutoff = new Date(args.now.getTime() - args.afterDays * DAY_MS);
  const current = pairDebts(args.expenses, args.payments);
  if (current.length === 0) return [];
  const old = pairDebts(
    args.expenses.filter((e) => e.createdAt <= cutoff),
    args.payments.filter((p) => p.createdAt <= cutoff)
  );
  const due: Debt[] = [];
  for (const d of current) {
    const before = old.find((o) => o.fromId === d.fromId && o.toId === d.toId);
    if (!before) continue;
    const cents = Math.min(d.cents, before.cents);
    if (cents < MIN_REMIND_CENTS) continue;
    if (!args.canNotify(d.fromId)) continue;
    const last = lastReminderAt(args.reminders, d.fromId, d.toId);
    if (last && last > cutoff) continue;
    due.push({ fromId: d.fromId, toId: d.toId, cents });
  }
  return due;
}

/** Текст уведомления должнику. Реквизиты в него не кладём: пуш виден на экране блокировки. */
export function reminderNotification(args: {
  kind: "manual" | "auto";
  creditorName: string;
  groupName: string;
  cents: number;
  currency: string;
}): { title: string; body: string } {
  const sum = formatCents(args.cents, args.currency);
  return {
    title:
      args.kind === "manual"
        ? `${args.creditorName} напоминает: ты должен(на) ${sum}`
        : `Напоминание: ты должен(на) ${args.creditorName} ${sum}`,
    body: `Группа «${args.groupName}» · открой «Баланс», чтобы отметить перевод`,
  };
}

/** Текст, который кредитор отправляет сам — должнику без аккаунта (ему пуш не отправить). */
export function reminderMessage(args: { debtorName: string; groupName: string; cents: number; currency: string; requisites?: string | null }): string {
  const sum = formatCents(args.cents, args.currency);
  const lines = [
    `Привет, ${args.debtorName}! Напоминаю про «${args.groupName}»: с тобой надо рассчитаться на ${sum} 🙏`,
  ];
  if (args.requisites?.trim()) lines.push(`Куда: ${args.requisites.trim()}`);
  return lines.join("\n");
}

/** «2 ч назад» / «только что» для подписи «напомнили …». */
export function agoLabel(from: Date, now: Date): string {
  const min = Math.floor((now.getTime() - from.getTime()) / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}
