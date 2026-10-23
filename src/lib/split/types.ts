// Контракт API «Сочтёмся» (ответы сервера). Клиентские хуки и сервер сериализации держат ОДНИ типы:
// даты — строки ГГГГ-ММ-ДД (тип DATE), деньги — целые центы, участники — SplitMember.id.

import type { SplitMode } from "./split";

export type SplitRole = "owner" | "member";
export type SplitMemberStatus = "active" | "left" | "removed";

export interface SplitMemberDTO {
  /** SplitMember.id — именно на него ссылаются траты и переводы */
  id: string;
  /** null — участник без аккаунта */
  userId: string | null;
  name: string;
  emoji: string;
  color: string;
  avatarUrl: string | null;
  role: SplitRole;
  status: SplitMemberStatus;
  /** Реквизиты для возврата долгов (User.paymentDetails) — видят только участники группы */
  paymentDetails: string | null;
}

export interface SplitGroupSummaryDTO {
  id: string;
  name: string;
  emoji: string;
  color: string;
  currency: string;
  /** Активные участники */
  memberCount: number;
  members: Pick<SplitMemberDTO, "id" | "name" | "emoji" | "color" | "avatarUrl">[];
  myMemberId: string;
  /** Мой итоговый баланс в центах: «+» мне должны, «−» я должен */
  myBalanceCents: number;
  /** Когда в группе последний раз что-то менялось (ISO) */
  lastActivityAt: string;
}

export interface SplitGroupDTO {
  id: string;
  name: string;
  emoji: string;
  color: string;
  currency: string;
  /** null — владелец ограничил приглашения, а запрашивающий не владелец */
  inviteCode: string | null;
  allowMemberInvites: boolean;
  myMemberId: string;
  myRole: SplitRole;
  /** Все участники, включая вышедших: их долги и история остаются */
  members: SplitMemberDTO[];
  createdAt: string;
}

export interface SplitShareDTO {
  memberId: string;
  cents: number;
  weight: number | null;
}

export interface SplitExpenseDTO {
  id: string;
  /** Сумма в валюте группы — в ней считаются долги */
  amountCents: number;
  /** Что ввели, если трата внесена в другой валюте (500 $ при группе в Br); иначе null */
  originalAmountCents: number | null;
  originalCurrency: string | null;
  description: string;
  category: string;
  paidById: string;
  spentOn: string;
  note: string | null;
  splitMode: SplitMode;
  shares: SplitShareDTO[];
  createdById: string;
  recurringId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SplitPaymentDTO {
  id: string;
  fromId: string;
  toId: string;
  amountCents: number;
  paidOn: string;
  note: string | null;
  /** Перевод «за конкретную трату» — помечает долю в ней оплаченной; null — перевод вообще */
  expenseId: string | null;
  createdById: string;
  createdAt: string;
}

export interface SplitRecurringDTO {
  id: string;
  description: string;
  category: string;
  /** Сумма в валюте группы (для шаблона в иностранной валюте — последний пересчёт, каждый период считается заново) */
  amountCents: number;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  paidById: string;
  splitMode: SplitMode;
  template: { memberId: string; value: number | null }[];
  dayOfMonth: number;
  startsOn: string;
  endsOn: string | null;
  active: boolean;
  createdById: string;
}

/** Всё, что нужно для экрана группы кроме состава: траты, переводы, шаблоны. Баланс считает клиент. */
export interface SplitLedgerDTO {
  expenses: SplitExpenseDTO[];
  payments: SplitPaymentDTO[];
  recurrings: SplitRecurringDTO[];
}

export interface SplitActivityDTO {
  id: string;
  actorId: string | null;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}
