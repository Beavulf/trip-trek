// Деление траты на доли в центах. Единственный источник правды для API, формы (живая подсказка
// «по 12,50 с каждого»), шаблонов повторяющихся трат и тестов: Σ долей ВСЕГДА равна сумме траты,
// копейки не рождаются и не теряются (в float-версии бюджета поездок этого приходилось добиваться
// отдельно — см. lib/budget/money.ts).

export const SPLIT_MODES = ["equal", "exact", "shares", "percent"] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export const isSplitMode = (v: unknown): v is SplitMode =>
  typeof v === "string" && (SPLIT_MODES as readonly string[]).includes(v);

/** Потолки: форма не нарисует больше, а запрос «на тысячу людей» не должен греть сервер. */
export const MAX_SPLIT_MEMBERS = 50;
export const MAX_SHARE_WEIGHT = 10_000;
/** 100% в сотых долях процента: 33,33% = 3333. */
export const PERCENT_TOTAL = 10_000;

/**
 * Один участник деления. value зависит от режима:
 *  equal   — не используется;
 *  exact   — сумма доли в центах;
 *  shares  — вес (целое ≥ 0; 0 = не участвует), «2 порции»;
 *  percent — процент в сотых долях (3333 = 33,33%).
 */
export interface SplitItem {
  memberId: string;
  value?: number | null;
}

export interface ComputedShare {
  memberId: string;
  cents: number;
  /** Вес/процент для режимов shares/percent — чтобы форма правки восстанавливалась точно */
  weight: number | null;
}

export type SplitResult = { ok: true; shares: ComputedShare[] } | { ok: false; error: string };

const fail = (error: string): SplitResult => ({ ok: false, error });

/**
 * Метод наибольшего остатка: каждому floor(total·w/W), недостающие копейки — тем, у кого дробная
 * часть больше (при равенстве — раньше в списке). Целочисленно: total·w ≤ 1e8·1e4 = 1e12 — точно в double.
 */
function distributeByWeights(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const floors = weights.map((w) => Math.floor((total * w) / sum));
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, frac: (total * w) % sum }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    if (weights[i] === 0) continue;
    floors[i] += 1;
    rest -= 1;
  }
  return floors;
}

export function computeShares(mode: SplitMode, amountCents: number, items: SplitItem[]): SplitResult {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return fail("Сумма должна быть больше нуля");
  if (items.length === 0) return fail("Выбери хотя бы одного участника");
  if (items.length > MAX_SPLIT_MEMBERS) return fail(`Не больше ${MAX_SPLIT_MEMBERS} участников в одной трате`);
  const ids = items.map((i) => i.memberId);
  if (ids.some((id) => typeof id !== "string" || !id)) return fail("Некорректный участник");
  if (new Set(ids).size !== ids.length) return fail("Участник указан дважды");

  if (mode === "equal") {
    // Поровну — частный случай весов 1:1: тот же остаток «первым по списку»
    const cents = distributeByWeights(amountCents, ids.map(() => 1));
    return { ok: true, shares: ids.map((memberId, i) => ({ memberId, cents: cents[i], weight: null })) };
  }

  const values = items.map((i) => i.value);
  if (values.some((v) => typeof v !== "number" || !Number.isInteger(v) || v < 0)) {
    return fail("Некорректные значения деления");
  }
  const nums = values as number[];

  if (mode === "exact") {
    const sum = nums.reduce((a, b) => a + b, 0);
    if (sum !== amountCents) return fail("Суммы долей не сходятся с суммой траты");
    // Нулевая доля — «не участвует»: в таблице долей ей делать нечего
    return {
      ok: true,
      shares: ids.flatMap((memberId, i) => (nums[i] > 0 ? [{ memberId, cents: nums[i], weight: null }] : [])),
    };
  }

  if (mode === "shares") {
    if (nums.some((v) => v > MAX_SHARE_WEIGHT)) return fail("Слишком большая доля");
    if (nums.every((v) => v === 0)) return fail("Выбери хотя бы одного участника");
    const cents = distributeByWeights(amountCents, nums);
    return {
      ok: true,
      shares: ids.flatMap((memberId, i) => (nums[i] > 0 ? [{ memberId, cents: cents[i], weight: nums[i] }] : [])),
    };
  }

  // percent
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum !== PERCENT_TOTAL) return fail("Проценты должны давать ровно 100%");
  const cents = distributeByWeights(amountCents, nums);
  return {
    ok: true,
    shares: ids.flatMap((memberId, i) => (nums[i] > 0 ? [{ memberId, cents: cents[i], weight: nums[i] }] : [])),
  };
}

/**
 * Для режима «проценты»: разложить 100% поровну между n людьми в сотых долях (последний добирает остаток) —
 * стартовое значение формы, чтобы сумма сразу была 100%.
 */
export function evenPercents(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(PERCENT_TOTAL / n);
  const rest = PERCENT_TOTAL - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * Пересчитать готовые доли на новую сумму пропорционально (метод наибольшего остатка, Σ = newTotal точно).
 * Нужно повторяющейся трате в иностранной валюте: аренда 500 $ с долями «точными суммами» каждый месяц получает
 * другую сумму в местной валюте, а соотношение долей сохраняется. BigInt — произведение центов не должно терять точность.
 */
export function scaleShares(
  shares: { memberId: string; cents: number }[],
  newTotal: number
): { memberId: string; cents: number }[] {
  const sum = shares.reduce((a, s) => a + s.cents, 0);
  if (sum <= 0 || newTotal <= 0) return shares.map((s) => ({ memberId: s.memberId, cents: 0 }));
  const total = BigInt(newTotal);
  const denom = BigInt(sum);
  const parts = shares.map((s, i) => {
    const product = total * BigInt(s.cents);
    return { i, base: Number(product / denom), frac: Number(product % denom) };
  });
  let rest = newTotal - parts.reduce((a, p) => a + p.base, 0);
  const order = [...parts].sort((a, b) => b.frac - a.frac || a.i - b.i);
  const cents = parts.map((p) => p.base);
  for (const p of order) {
    if (rest <= 0) break;
    if (shares[p.i].cents === 0) continue;
    cents[p.i] += 1;
    rest -= 1;
  }
  return shares.map((s, i) => ({ memberId: s.memberId, cents: cents[i] }));
}
