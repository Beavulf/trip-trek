import { CURRENCY_CODES } from "@/lib/currencies";
import { categoryOf, SPLIT_CATEGORIES } from "./categories";
import { addMonths, diffDays, isDateKey, monthOf } from "./dates";
import { MAX_AMOUNT_CENTS } from "./money";
import { isRemindAfterDays } from "./reminders";
import { MAX_BACKFILL_MONTHS } from "./recurrence";
import { computeShares, isSplitMode, type ComputedShare, type SplitItem, type SplitMode } from "./split";

// Нормализация входа API «Сочтёмся» — чистые функции без БД (тесты рядом). Сервер — последний рубеж:
// форма не отправит сумму долей, не равную сумме траты, а прямой запрос отправит, и баланс тихо поедет.

type Body = Record<string, unknown>;
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = <T>(error: string): Result<T> => ({ ok: false, error });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const MAX_DESCRIPTION = 200;
export const MAX_NOTE = 500;
export const MAX_NAME = 60;
/** Дата траты не раньше этого числа дней назад и не позже +2 суток вперёд (часовые пояса). */
export const MAX_PAST_DAYS = 3650;
export const MAX_FUTURE_DAYS = 2;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function cleanText(v: unknown, max: number): string | null {
  const s = str(v);
  return s ? s.slice(0, max) : null;
}

function amountCentsOf(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= MAX_AMOUNT_CENTS ? v : null;
}

function dateOf(v: unknown, todayKey: string): Result<string> {
  if (!isDateKey(v)) return fail("Некорректная дата");
  const diff = diffDays(todayKey, v); // >0 — в будущем
  if (diff > MAX_FUTURE_DAYS) return fail("Дата в будущем");
  if (-diff > MAX_PAST_DAYS) return fail("Слишком давняя дата");
  return ok(v);
}

function splitItemsOf(v: unknown): SplitItem[] | null {
  if (!Array.isArray(v)) return null;
  const items: SplitItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Body;
    const memberId = typeof r.memberId === "string" ? r.memberId : "";
    if (!memberId) return null;
    items.push({ memberId, value: typeof r.value === "number" ? r.value : null });
  }
  return items;
}

// --- Исходная сумма в другой валюте ---

export interface NormalizedOriginal {
  amountCents: number;
  currency: string;
}

/**
 * `original: { amountCents, currency }` — то, что ввели, когда валюта траты не совпадает с валютой группы.
 * Совпадает с валютой группы или не передано — null (сумма и так в ней). Сервер сумму пересчёта НЕ проверяет:
 * друзья вправе поправить её вручную (реальный курс обмена не равен курсу API), а курс ниже — не секрет.
 */
function originalOf(raw: unknown, groupCurrency: string): Result<NormalizedOriginal | null> {
  if (raw === undefined || raw === null) return ok(null);
  if (typeof raw !== "object" || Array.isArray(raw)) return fail("Некорректная исходная сумма");
  const r = raw as Body;
  const currency = typeof r.currency === "string" ? r.currency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) return fail("Некорректная валюта");
  if (currency === groupCurrency.toUpperCase()) return ok(null);
  const amountCents = amountCentsOf(r.amountCents);
  if (amountCents === null) return fail("Исходная сумма должна быть больше нуля");
  return ok({ amountCents, currency });
}

// --- Трата ---

export interface NormalizedExpense {
  /** В валюте группы */
  amountCents: number;
  original: NormalizedOriginal | null;
  description: string;
  category: string;
  paidById: string;
  spentOn: string;
  note: string | null;
  splitMode: SplitMode;
  shares: ComputedShare[];
}

/**
 * `allowedMemberIds` — кого можно указать плательщиком/участником: активные участники группы
 * (при правке старой траты вызывающий добавляет тех, кто уже в ней, даже если они вышли).
 */
export function normalizeExpenseInput(
  body: Body,
  ctx: { allowedMemberIds: ReadonlySet<string>; todayKey: string; groupCurrency: string }
): Result<NormalizedExpense> {
  const amountCents = amountCentsOf(body.amountCents);
  if (amountCents === null) return fail("Сумма должна быть больше нуля");
  const original = originalOf(body.original, ctx.groupCurrency);
  if (!original.ok) return original;

  const category = categoryOf(typeof body.category === "string" ? body.category : "other");
  // Без описания — название категории: сумма и категория — минимум для записи траты
  const description = (cleanText(body.description, MAX_DESCRIPTION) ?? SPLIT_CATEGORIES[category].label).slice(0, MAX_DESCRIPTION);

  const paidById = str(body.paidById);
  if (!paidById || !ctx.allowedMemberIds.has(paidById)) return fail("Плательщик не из этой группы");

  const date = dateOf(body.spentOn, ctx.todayKey);
  if (!date.ok) return date;

  const mode = body.splitMode ?? "equal";
  if (!isSplitMode(mode)) return fail("Неизвестный способ деления");
  const items = splitItemsOf(body.split);
  if (!items) return fail("Не указано, как делить");
  if (items.some((i) => !ctx.allowedMemberIds.has(i.memberId))) return fail("В делении есть не участники группы");

  const computed = computeShares(mode, amountCents, items);
  if (!computed.ok) return fail(computed.error);

  return ok({
    amountCents,
    original: original.value,
    description,
    category,
    paidById,
    spentOn: date.value,
    note: cleanText(body.note, MAX_NOTE),
    splitMode: mode,
    shares: computed.shares,
  });
}

// --- Перевод ---

export interface NormalizedPayment {
  fromId: string;
  toId: string;
  amountCents: number;
  paidOn: string;
  note: string | null;
  /** За какую трату перевод (существование в группе проверяет роут) */
  expenseId: string | null;
  clientKey: string | null;
}

/** `knownMemberIds` — все участники группы, и вышедшие тоже: их долги надо иметь возможность закрыть. */
export function normalizePaymentInput(
  body: Body,
  ctx: { knownMemberIds: ReadonlySet<string>; todayKey: string }
): Result<NormalizedPayment> {
  const amountCents = amountCentsOf(body.amountCents);
  if (amountCents === null) return fail("Сумма должна быть больше нуля");
  const fromId = str(body.fromId);
  const toId = str(body.toId);
  if (!fromId || !toId || fromId === toId) return fail("Перевод — между двумя разными людьми");
  if (!ctx.knownMemberIds.has(fromId) || !ctx.knownMemberIds.has(toId)) return fail("Участники перевода не из этой группы");
  const date = dateOf(body.paidOn, ctx.todayKey);
  if (!date.ok) return date;
  const key = str(body.clientKey);
  return ok({
    fromId,
    toId,
    amountCents,
    paidOn: date.value,
    note: cleanText(body.note, MAX_NOTE),
    expenseId: str(body.expenseId) || null,
    clientKey: key ? key.slice(0, 100) : null,
  });
}

// --- Повторяющаяся трата ---

export interface NormalizedRecurring {
  description: string;
  category: string;
  /** В валюте группы (для шаблона в иностранной валюте — последний пересчёт) */
  amountCents: number;
  original: NormalizedOriginal | null;
  paidById: string;
  splitMode: SplitMode;
  template: { memberId: string; value: number | null }[];
  dayOfMonth: number;
  startsOn: string;
  endsOn: string | null;
}

export function normalizeRecurringInput(
  body: Body,
  ctx: { allowedMemberIds: ReadonlySet<string>; todayKey: string; groupCurrency: string }
): Result<NormalizedRecurring> {
  const amountCents = amountCentsOf(body.amountCents);
  if (amountCents === null) return fail("Сумма должна быть больше нуля");
  const original = originalOf(body.original, ctx.groupCurrency);
  if (!original.ok) return original;
  const category = categoryOf(typeof body.category === "string" ? body.category : "other");
  const description = cleanText(body.description, MAX_DESCRIPTION);
  if (!description) return fail("Назови повторяющуюся трату");

  const paidById = str(body.paidById);
  if (!paidById || !ctx.allowedMemberIds.has(paidById)) return fail("Плательщик не из этой группы");

  const mode = body.splitMode ?? "equal";
  if (!isSplitMode(mode)) return fail("Неизвестный способ деления");
  const items = splitItemsOf(body.split);
  if (!items) return fail("Не указано, как делить");
  if (items.some((i) => !ctx.allowedMemberIds.has(i.memberId))) return fail("В делении есть не участники группы");
  const computed = computeShares(mode, amountCents, items);
  if (!computed.ok) return fail(computed.error);

  const day = body.dayOfMonth;
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31) return fail("День месяца — от 1 до 31");

  if (!isDateKey(body.startsOn)) return fail("Некорректная дата начала");
  const earliest = `${addMonths(monthOf(ctx.todayKey), -MAX_BACKFILL_MONTHS)}-01`;
  if (body.startsOn < earliest) return fail("Начало не раньше года назад");
  let endsOn: string | null = null;
  if (body.endsOn !== undefined && body.endsOn !== null && body.endsOn !== "") {
    if (!isDateKey(body.endsOn)) return fail("Некорректная дата окончания");
    if (body.endsOn < body.startsOn) return fail("Окончание раньше начала");
    endsOn = body.endsOn;
  }

  return ok({
    description,
    category,
    amountCents,
    original: original.value,
    paidById,
    splitMode: mode,
    // Шаблон хранит то, что ввёл человек (веса/проценты/центы), а не готовые доли: сумма может не меняться, состав — да
    template: items.map((i) => ({ memberId: i.memberId, value: mode === "equal" ? null : (i.value ?? null) })),
    dayOfMonth: day,
    startsOn: body.startsOn,
    endsOn,
  });
}

// --- Группа и участники ---

export interface NormalizedGroup {
  name: string;
  emoji: string;
  color: string;
  currency: string;
  allowMemberInvites?: boolean;
  /** Автонапоминание должникам: 3/7/14 дней; null — выключено (ADR-0010) */
  remindAfterDays?: number | null;
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Создание требует name; правка — любое подмножество полей (partial). */
export function normalizeGroupInput(body: Body, opts: { partial: boolean }): Result<Partial<NormalizedGroup>> {
  const out: Partial<NormalizedGroup> = {};
  if (!opts.partial || body.name !== undefined) {
    const name = cleanText(body.name, MAX_NAME);
    if (!name) return fail("Назови группу");
    out.name = name;
  }
  if (body.emoji !== undefined) {
    const e = str(body.emoji);
    if (!e || e.length > 16) return fail("Некорректный значок");
    out.emoji = e;
  }
  if (body.color !== undefined) {
    if (typeof body.color !== "string" || !COLOR_RE.test(body.color)) return fail("Некорректный цвет");
    out.color = body.color;
  }
  if (!opts.partial || body.currency !== undefined) {
    const cur = str(body.currency).toUpperCase();
    if (!(CURRENCY_CODES as readonly string[]).includes(cur)) return fail("Эта валюта не поддерживается");
    out.currency = cur;
  }
  if (body.allowMemberInvites !== undefined) {
    if (typeof body.allowMemberInvites !== "boolean") return fail("Некорректная настройка приглашений");
    out.allowMemberInvites = body.allowMemberInvites;
  }
  if (body.remindAfterDays !== undefined) {
    if (body.remindAfterDays !== null && !isRemindAfterDays(body.remindAfterDays)) return fail("Некорректный срок напоминания");
    out.remindAfterDays = body.remindAfterDays;
  }
  return ok(out);
}

export interface NormalizedMemberProfile {
  displayName: string;
  emoji: string;
  color: string;
}

/** Профиль участника в группе: имя обязательно, значок и цвет — с запасными значениями. */
export function normalizeMemberProfile(body: Body, fallback?: Partial<NormalizedMemberProfile>): Result<NormalizedMemberProfile> {
  const displayName = cleanText(body.displayName, 50) ?? fallback?.displayName ?? null;
  if (!displayName) return fail("Напиши имя");
  const emojiRaw = str(body.emoji);
  const emoji = emojiRaw && emojiRaw.length <= 16 ? emojiRaw : (fallback?.emoji ?? "👤");
  const color =
    typeof body.color === "string" && COLOR_RE.test(body.color) ? body.color : (fallback?.color ?? "#94a3b8");
  return ok({ displayName, emoji, color });
}
