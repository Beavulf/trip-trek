import { EXPENSE_CATEGORIES } from "@/lib/types";
import { roundCents } from "./convert";
import { pairDebtCents, type ExpenseShape } from "./balances";
import { fromCents, toCents } from "./money";

// Нормализация входа POST /api/expenses — чистая функция без БД (тесты рядом).
// Сервер — последний рубеж: UI не отправит плательщика в splitWith или перевод на двоих,
// а прямой вызов API отправит, и расчёт долгов тихо исказится (плательщик в splitWith
// считался дважды: A платит 90 за A и B → B должен 30 вместо 45; дубль [B,B] → B платит дважды).

export const MAX_EXPENSE_AMOUNT = 1_000_000;
export const SETTLEMENT_CATEGORY = "settlement";

export interface NormalizedExpense {
  amount: number;
  category: string;
  description: string;
  paidById: string;
  dayId: string | null;
  /** Без дублей и без плательщика */
  splitWith: string[];
  excludeSelf: boolean;
  /** Только у перевода (category "settlement") */
  settlementKey: string | null;
  originalAmount: number | null;
  originalCurrency: string | null;
}

export type ExpenseInputResult = { ok: true; value: NormalizedExpense } | { ok: false; error: string };

const fail = (error: string): ExpenseInputResult => ({ ok: false, error });

function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function normalizeExpenseInput(body: Record<string, unknown>): ExpenseInputResult {
  const rawAmount = parseAmount(body.amount);
  if (rawAmount === null || rawAmount <= 0 || rawAmount > MAX_EXPENSE_AMOUNT) {
    return fail(`Сумма должна быть больше 0 и не больше ${MAX_EXPENSE_AMOUNT}`);
  }
  const amount = roundCents(rawAmount);
  if (amount <= 0) return fail("Сумма должна быть не меньше 0.01");

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description || description.length > 500) return fail("Описание обязательно (до 500 символов)");

  const category = typeof body.category === "string" ? body.category : "";
  const isSettlement = category === SETTLEMENT_CATEGORY;
  if (!isSettlement && !(category in EXPENSE_CATEGORIES)) return fail("Неизвестная категория траты");

  const paidById = typeof body.paidById === "string" ? body.paidById : "";
  if (!paidById) return fail("Не указан плательщик");

  // splitWith: только строки, без дублей. Плательщик в списке = он участвует в делении
  // (excludeSelf тогда ложь), а из самого списка убираем — плательщик всегда добавляется отдельно
  const rawSplit = Array.isArray(body.splitWith)
    ? body.splitWith.filter((id: unknown): id is string => typeof id === "string" && id !== "")
    : [];
  const payerListed = rawSplit.includes(paidById);
  const splitWith = [...new Set(rawSplit)].filter((id) => id !== paidById);
  // Платить «за никого, кроме себя» не бывает — это обычная личная трата
  const excludeSelf = splitWith.length === 0 ? false : payerListed ? false : body.excludeSelf === true;

  let settlementKey: string | null = null;
  if (isSettlement) {
    // Перевод — ровно от плательщика одному получателю, и только с ключом идемпотентности
    if (splitWith.length !== 1) return fail("Перевод — ровно одному получателю");
    if (!body.excludeSelf || payerListed) return fail("Некорректный перевод");
    const key = body.settlementKey;
    if (typeof key !== "string" || !key.startsWith("settle-") || key.length > 200) {
      return fail("Для перевода нужен settlementKey");
    }
    settlementKey = key;
  }

  const origAmount = parseAmount(body.originalAmount);
  const origCurrency =
    typeof body.originalCurrency === "string" && /^[A-Za-z]{3}$/.test(body.originalCurrency)
      ? body.originalCurrency.toUpperCase()
      : null;
  const hasOriginal = origAmount !== null && origAmount > 0 && origAmount <= 1e12 && origCurrency !== null;

  return {
    ok: true,
    value: {
      amount,
      category: category.slice(0, 50),
      description,
      paidById,
      dayId: !isSettlement && typeof body.dayId === "string" && body.dayId ? body.dayId : null,
      splitWith,
      excludeSelf: isSettlement ? true : excludeSelf,
      settlementKey,
      originalAmount: hasOriginal ? origAmount : null,
      originalCurrency: hasOriginal ? origCurrency : null,
    },
  };
}

export type SettlementCheck = { ok: true } | { ok: false; status: number; error: string };

/**
 * Перевод не может быть больше реального долга пары: «Перевели» с двух устройств (или по устаревшему
 * экрану) раньше создавало встречный долг. Долг считается тем же неттингом, что и экран расчёта.
 */
export function checkSettlementAgainstDebt(
  expenses: ExpenseShape[],
  fromId: string,
  toId: string,
  amount: number
): SettlementCheck {
  const debt = pairDebtCents(expenses, fromId, toId);
  if (debt <= 0) return { ok: false, status: 409, error: "Долга уже нет — перевод не нужен" };
  if (toCents(amount) > debt) {
    return {
      ok: false,
      status: 409,
      error: `Перевод больше долга (осталось ${fromCents(debt).toFixed(2)}) — обнови экран`,
    };
  }
  return { ok: true };
}

/**
 * Делёж траты из бэкапа: оставляем только тех, кто сейчас в поездке, без дублей и без плательщика.
 * В бэкапе splitWith — id людей прежней поездки; в новую они не попадают (импорт создаёт поездку
 * с одним владельцем), и «висячие» id раньше создавали долги несуществующим людям.
 */
export function sanitizeImportedSplit(
  raw: unknown,
  paidById: string,
  memberIds: ReadonlySet<string>,
  excludeSelfRaw: unknown
): { splitWith: string; excludeSelf: boolean } {
  const ids = typeof raw === "string" ? raw.split(",").filter(Boolean) : [];
  const payerListed = ids.includes(paidById);
  const splitWith = [...new Set(ids)].filter((id) => id !== paidById && memberIds.has(id));
  const excludeSelf = splitWith.length === 0 ? false : payerListed ? false : excludeSelfRaw === true;
  return { splitWith: splitWith.join(","), excludeSelf };
}
