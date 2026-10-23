import { bpToInput, centsToInput, parseAmountToCents } from "./money";
import { computeShares, evenPercents, PERCENT_TOTAL, type ComputedShare, type SplitItem, type SplitMode } from "./split";
import type { SplitExpenseDTO } from "./types";

// Состояние способа деления в форме траты — чистая логика (тесты рядом): форма держит строки как их вводит человек,
// а сюда отдаёт «режим + черновик», получая обратно готовые доли и понятную причину, если сумма не сходится.

export interface SplitDraft {
  /** equal: кто участвует */
  selected: string[];
  /** exact: сумма на человека, строкой как введена */
  exact: Record<string, string>;
  /** shares: вес («2 порции») */
  weights: Record<string, number>;
  /** percent: процент строкой, «33.33» */
  percents: Record<string, string>;
}

export const emptyDraft = (): SplitDraft => ({ selected: [], exact: {}, weights: {}, percents: {} });

export interface SplitEvaluation {
  items: SplitItem[];
  shares: ComputedShare[] | null;
  /** Почему нельзя сохранять; null — всё сходится */
  error: string | null;
  /** exact: сколько ещё не распределено (может быть отрицательным — перебор) */
  remainingCents: number | null;
  /** percent: сумма введённых процентов в сотых долях */
  percentBp: number | null;
}

const fail = (error: string, extra: Partial<SplitEvaluation> = {}): SplitEvaluation => ({
  items: [],
  shares: null,
  error,
  remainingCents: null,
  percentBp: null,
  ...extra,
});

/** `orderedIds` — порядок участников формы: от него зависит, кому достанется лишняя копейка. */
export function evaluateSplit(
  mode: SplitMode,
  draft: SplitDraft,
  amountCents: number,
  orderedIds: string[]
): SplitEvaluation {
  let items: SplitItem[] = [];
  let remainingCents: number | null = null;
  let percentBp: number | null = null;

  if (mode === "equal") {
    items = orderedIds.filter((id) => draft.selected.includes(id)).map((memberId) => ({ memberId }));
  } else if (mode === "exact") {
    for (const memberId of orderedIds) {
      const raw = (draft.exact[memberId] ?? "").trim();
      if (!raw) continue;
      const cents = parseAmountToCents(raw);
      if (cents === null) return fail("Проверь суммы: нужны числа");
      if (cents > 0) items.push({ memberId, value: cents });
    }
    remainingCents = amountCents - items.reduce((a, i) => a + (i.value ?? 0), 0);
  } else if (mode === "shares") {
    items = orderedIds.flatMap((memberId) => {
      const w = draft.weights[memberId] ?? 0;
      return w > 0 ? [{ memberId, value: w }] : [];
    });
  } else {
    let sum = 0;
    for (const memberId of orderedIds) {
      const raw = (draft.percents[memberId] ?? "").trim();
      if (!raw) continue;
      const bp = parseAmountToCents(raw); // «33.33» → 3333: сотые доли процента, та же арифметика, что у копеек
      if (bp === null) return fail("Проверь проценты: нужны числа");
      if (bp > 0) {
        items.push({ memberId, value: bp });
        sum += bp;
      }
    }
    percentBp = sum;
  }

  if (amountCents <= 0) return { items, shares: null, error: null, remainingCents, percentBp };
  if (items.length === 0) return fail("Выбери, на кого делить", { remainingCents, percentBp });
  const r = computeShares(mode, amountCents, items);
  if (!r.ok) return { items, shares: null, error: r.error, remainingCents, percentBp };
  return { items, shares: r.shares, error: null, remainingCents, percentBp };
}

/** Стартовое состояние: по умолчанию делим поровну на всех. */
export function defaultDraft(memberIds: string[]): SplitDraft {
  const pct = evenPercents(memberIds.length);
  return {
    selected: [...memberIds],
    exact: {},
    weights: Object.fromEntries(memberIds.map((id) => [id, 1])),
    percents: Object.fromEntries(memberIds.map((id, i) => [id, bpToInput(pct[i])])),
  };
}

/** Форма правки: восстановить режим и ввод из сохранённой траты. */
export function draftFromExpense(e: Pick<SplitExpenseDTO, "splitMode" | "shares">, memberIds: string[]): SplitDraft {
  const base = defaultDraft(memberIds);
  const draft: SplitDraft = {
    selected: e.shares.map((s) => s.memberId),
    exact: {},
    weights: Object.fromEntries(memberIds.map((id) => [id, 0])),
    percents: Object.fromEntries(memberIds.map((id) => [id, ""])),
  };
  for (const s of e.shares) {
    draft.exact[s.memberId] = centsToInput(s.cents);
    if (e.splitMode === "shares") draft.weights[s.memberId] = s.weight ?? 1;
    if (e.splitMode === "percent") draft.percents[s.memberId] = bpToInput(s.weight ?? 0);
  }
  // Режимы, которых в этой трате не было, получают разумные заготовки — переключение не начинается с пустоты
  if (e.splitMode !== "shares") draft.weights = Object.fromEntries(memberIds.map((id) => [id, draft.selected.includes(id) ? 1 : 0]));
  if (e.splitMode !== "percent") draft.percents = base.percents;
  return draft;
}

/** Ввод суммами для режима «Суммы» из текущего равного деления — чтобы переключение не обнуляло форму. */
export function exactFromEqual(amountCents: number, selectedInOrder: string[]): Record<string, string> {
  const r = computeShares("equal", amountCents, selectedInOrder.map((memberId) => ({ memberId })));
  if (!r.ok) return {};
  return Object.fromEntries(r.shares.map((s) => [s.memberId, centsToInput(s.cents)]));
}

export interface RecentTemplate {
  key: string;
  description: string;
  category: string;
  paidById: string;
  splitMode: SplitMode;
  shares: SplitExpenseDTO["shares"];
}

/** Последние различные траты («такси», «Пятёрочка») — быстрая вставка «как в прошлый раз». */
export function recentTemplates(expenses: SplitExpenseDTO[], limit = 6): RecentTemplate[] {
  const seen = new Set<string>();
  const out: RecentTemplate[] = [];
  const sorted = [...expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const e of sorted) {
    if (e.recurringId) continue; // шаблоны аренды сюда не тянем: они и так повторяются сами
    const key = e.description.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      description: e.description,
      category: e.category,
      paidById: e.paidById,
      splitMode: e.splitMode,
      shares: e.shares,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export { PERCENT_TOTAL };

/** Доли сохранённой траты → вход API (для «Вернуть» после удаления и копирования траты). */
export function itemsFromExpense(e: Pick<SplitExpenseDTO, "splitMode" | "shares">): SplitItem[] {
  return e.shares.map((s) => ({
    memberId: s.memberId,
    value: e.splitMode === "equal" ? null : e.splitMode === "exact" ? s.cents : (s.weight ?? null),
  }));
}

/** Форма правки шаблона повторяющейся траты: шаблон хранит ввод (веса/проценты/центы) — восстанавливаем из него. */
export function draftFromRecurring(
  r: { splitMode: SplitMode; amountCents: number; template: { memberId: string; value: number | null }[] },
  memberIds: string[]
): SplitDraft {
  const computed = computeShares(r.splitMode, r.amountCents, r.template.map((t) => ({ memberId: t.memberId, value: t.value })));
  const shares = computed.ok
    ? computed.shares
    : r.template.map((t) => ({ memberId: t.memberId, cents: r.splitMode === "exact" ? (t.value ?? 0) : 0, weight: t.value }));
  return draftFromExpense({ splitMode: r.splitMode, shares }, memberIds);
}
