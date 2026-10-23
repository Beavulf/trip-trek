import type {
  SplitActivity,
  SplitExpense,
  SplitMember,
  SplitPayment,
  SplitRecurring,
  SplitShare,
  User,
} from "@prisma/client";
import { dateToKey } from "./dates";
import { isSplitMode } from "./split";
import type {
  SplitActivityDTO,
  SplitExpenseDTO,
  SplitMemberDTO,
  SplitPaymentDTO,
  SplitRecurringDTO,
  SplitRole,
} from "./types";

// Строки Prisma → DTO API. Единственное место, где DATE превращается в ГГГГ-ММ-ДД, а Json — в типы.

export type MemberRow = SplitMember & { user: Pick<User, "avatarUrl" | "paymentDetails"> | null };

export const MEMBER_INCLUDE = { user: { select: { avatarUrl: true, paymentDetails: true } } } as const;

export function memberDTO(m: MemberRow): SplitMemberDTO {
  return {
    id: m.id,
    userId: m.userId,
    name: m.displayName,
    emoji: m.emoji,
    color: m.color,
    avatarUrl: m.user?.avatarUrl ?? null,
    role: (m.role === "owner" ? "owner" : "member") as SplitRole,
    status: m.status === "left" || m.status === "removed" ? m.status : "active",
    paymentDetails: m.user?.paymentDetails ?? null,
  };
}

export const EXPENSE_INCLUDE = { shares: true } as const;

export function expenseDTO(e: SplitExpense & { shares: SplitShare[] }): SplitExpenseDTO {
  return {
    id: e.id,
    amountCents: e.amountCents,
    originalAmountCents: e.originalAmountCents,
    originalCurrency: e.originalCurrency,
    description: e.description,
    category: e.category,
    paidById: e.paidById,
    spentOn: dateToKey(e.spentOn),
    note: e.note,
    splitMode: isSplitMode(e.splitMode) ? e.splitMode : "equal",
    shares: e.shares.map((s) => ({ memberId: s.memberId, cents: s.cents, weight: s.weight })),
    createdById: e.createdById,
    recurringId: e.recurringId,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export function paymentDTO(p: SplitPayment): SplitPaymentDTO {
  return {
    id: p.id,
    fromId: p.fromId,
    toId: p.toId,
    amountCents: p.amountCents,
    paidOn: dateToKey(p.paidOn),
    note: p.note,
    createdById: p.createdById,
    createdAt: p.createdAt.toISOString(),
  };
}

/** template — Json в БД: приводим к известной форме, мусор отбрасываем (данные пишет только наш код, но читаем осторожно). */
function templateOf(raw: unknown): SplitRecurringDTO["template"] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const r = x as { memberId?: unknown; value?: unknown };
    return typeof r.memberId === "string"
      ? [{ memberId: r.memberId, value: typeof r.value === "number" ? r.value : null }]
      : [];
  });
}

export function recurringDTO(r: SplitRecurring): SplitRecurringDTO {
  return {
    id: r.id,
    description: r.description,
    category: r.category,
    amountCents: r.amountCents,
    originalAmountCents: r.originalAmountCents,
    originalCurrency: r.originalCurrency,
    paidById: r.paidById,
    splitMode: isSplitMode(r.splitMode) ? r.splitMode : "equal",
    template: templateOf(r.template),
    dayOfMonth: r.dayOfMonth,
    startsOn: dateToKey(r.startsOn),
    endsOn: r.endsOn ? dateToKey(r.endsOn) : null,
    active: r.active,
    createdById: r.createdById,
  };
}

export function activityDTO(a: SplitActivity): SplitActivityDTO {
  const data = a.data && typeof a.data === "object" && !Array.isArray(a.data) ? (a.data as Record<string, unknown>) : {};
  return { id: a.id, actorId: a.actorId, type: a.type, data, createdAt: a.createdAt.toISOString() };
}
