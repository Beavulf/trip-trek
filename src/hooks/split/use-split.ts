"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { computeShares, type SplitItem, type SplitMode } from "@/lib/split/split";
import type {
  SplitActivityDTO,
  SplitExpenseDTO,
  SplitGroupDTO,
  SplitGroupSummaryDTO,
  SplitLedgerDTO,
  SplitMemberDTO,
  SplitPaymentDTO,
  SplitRecurringDTO,
} from "@/lib/split/types";
import { splitApi, splitKeys } from "./api";

// Слой данных «Сочтёмся» (TanStack Query над /api/split). Траты и переводы — оптимистичные: строка
// появляется сразу, при ошибке список откатывается (тот же приём, что в бюджете поездок).

const TMP = "tmp-";
export const isTmpId = (id: string) => id.startsWith(TMP);

export function useSplitGroups() {
  return useQuery({
    queryKey: splitKeys.groups,
    queryFn: () => splitApi<SplitGroupSummaryDTO[]>("/groups"),
  });
}

export function useSplitGroup(groupId: string) {
  return useQuery({
    queryKey: splitKeys.group(groupId),
    queryFn: () => splitApi<SplitGroupDTO>(`/groups/${groupId}`),
    enabled: !!groupId,
  });
}

export function useSplitLedger(groupId: string) {
  return useQuery({
    queryKey: splitKeys.ledger(groupId),
    queryFn: () => splitApi<SplitLedgerDTO>(`/groups/${groupId}/ledger`),
    enabled: !!groupId,
  });
}

export function useSplitActivity(groupId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: splitKeys.activity(groupId),
    queryFn: ({ pageParam }) =>
      splitApi<{ items: SplitActivityDTO[]; nextBefore: string | null }>(
        `/groups/${groupId}/activity${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`
      ),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: enabled && !!groupId,
  });
}

/** После любой мутации: баланс на хабе, состав и журнал тоже могли поменяться. */
function useRefresh(groupId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: splitKeys.ledger(groupId) });
    void qc.invalidateQueries({ queryKey: splitKeys.group(groupId) });
    void qc.invalidateQueries({ queryKey: splitKeys.groups });
    void qc.invalidateQueries({ queryKey: splitKeys.activity(groupId) });
  };
}

// --- Группы ---

export interface GroupForm {
  name: string;
  emoji?: string;
  color?: string;
  currency: string;
  allowMemberInvites?: boolean;
  remindAfterDays?: number | null;
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GroupForm & { displayName?: string }) =>
      splitApi<SplitGroupDTO>("/groups", { method: "POST", body: data }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: splitKeys.groups }),
  });
}

export function useUpdateGroup(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: (data: Partial<GroupForm>) => splitApi<SplitGroupDTO>(`/groups/${groupId}`, { method: "PATCH", body: data }),
    onSettled: refresh,
  });
}

export function useDeleteGroup(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => splitApi<{ ok: true }>(`/groups/${groupId}`, { method: "DELETE", body: { name } }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: splitKeys.group(groupId) });
      qc.removeQueries({ queryKey: splitKeys.ledger(groupId) });
      void qc.invalidateQueries({ queryKey: splitKeys.groups });
    },
  });
}

// --- Траты ---

/** Что ввели, если валюта траты не совпадает с валютой группы (сумма `amountCents` при этом — уже пересчитанная). */
export interface OriginalAmount {
  amountCents: number;
  currency: string;
}

export interface ExpenseForm {
  /** В валюте группы */
  amountCents: number;
  original?: OriginalAmount | null;
  description: string;
  category: string;
  paidById: string;
  spentOn: string;
  note?: string | null;
  splitMode: SplitMode;
  split: SplitItem[];
}

function optimisticExpense(form: ExpenseForm, myMemberId: string, id: string, base?: SplitExpenseDTO): SplitExpenseDTO {
  const computed = computeShares(form.splitMode, form.amountCents, form.split);
  const now = new Date().toISOString();
  return {
    id,
    amountCents: form.amountCents,
    originalAmountCents: form.original?.amountCents ?? null,
    originalCurrency: form.original?.currency ?? null,
    description: form.description.trim() || "Трата",
    category: form.category,
    paidById: form.paidById,
    spentOn: form.spentOn,
    note: form.note?.trim() || null,
    splitMode: form.splitMode,
    shares: computed.ok ? computed.shares : [],
    createdById: base?.createdById ?? myMemberId,
    recurringId: base?.recurringId ?? null,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  };
}

const byDateDesc = (a: SplitExpenseDTO, b: SplitExpenseDTO) =>
  b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt);

/** Создать (без id) или изменить (с id) трату. */
export function useSaveExpense(groupId: string, myMemberId: string) {
  const qc = useQueryClient();
  const refresh = useRefresh(groupId);
  const key = splitKeys.ledger(groupId);
  return useMutation({
    mutationFn: ({ id, form }: { id?: string; form: ExpenseForm }) =>
      splitApi<SplitExpenseDTO>(id ? `/groups/${groupId}/expenses/${id}` : `/groups/${groupId}/expenses`, {
        method: id ? "PATCH" : "POST",
        body: form,
      }),
    onMutate: async ({ id, form }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SplitLedgerDTO>(key);
      if (prev) {
        const existing = id ? prev.expenses.find((e) => e.id === id) : undefined;
        const row = optimisticExpense(form, myMemberId, id ?? `${TMP}${Date.now()}`, existing);
        const expenses = id ? prev.expenses.map((e) => (e.id === id ? row : e)) : [row, ...prev.expenses];
        qc.setQueryData<SplitLedgerDTO>(key, { ...prev, expenses: expenses.sort(byDateDesc) });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: refresh,
  });
}

export function useDeleteExpense(groupId: string) {
  const qc = useQueryClient();
  const refresh = useRefresh(groupId);
  const key = splitKeys.ledger(groupId);
  return useMutation({
    mutationFn: (id: string) => splitApi<{ ok: true }>(`/groups/${groupId}/expenses/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SplitLedgerDTO>(key);
      if (prev) qc.setQueryData<SplitLedgerDTO>(key, { ...prev, expenses: prev.expenses.filter((e) => e.id !== id) });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: refresh,
  });
}

// --- Переводы ---

export interface PaymentForm {
  fromId: string;
  toId: string;
  amountCents: number;
  paidOn: string;
  note?: string | null;
  /** Перевод «за конкретную трату»: помечает долю в ней оплаченной */
  expenseId?: string | null;
  clientKey: string;
}

export function useSavePayment(groupId: string, myMemberId: string) {
  const qc = useQueryClient();
  const refresh = useRefresh(groupId);
  const key = splitKeys.ledger(groupId);
  return useMutation({
    mutationFn: (form: PaymentForm) =>
      splitApi<SplitPaymentDTO>(`/groups/${groupId}/payments`, { method: "POST", body: form }),
    onMutate: async (form) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SplitLedgerDTO>(key);
      if (prev) {
        const row: SplitPaymentDTO = {
          id: `${TMP}${form.clientKey}`,
          fromId: form.fromId,
          toId: form.toId,
          amountCents: form.amountCents,
          paidOn: form.paidOn,
          note: form.note ?? null,
          expenseId: form.expenseId ?? null,
          createdById: myMemberId,
          createdAt: new Date().toISOString(),
        };
        qc.setQueryData<SplitLedgerDTO>(key, { ...prev, payments: [row, ...prev.payments] });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: refresh,
  });
}

export function useDeletePayment(groupId: string) {
  const qc = useQueryClient();
  const refresh = useRefresh(groupId);
  const key = splitKeys.ledger(groupId);
  return useMutation({
    mutationFn: (id: string) => splitApi<{ ok: true }>(`/groups/${groupId}/payments/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SplitLedgerDTO>(key);
      if (prev) qc.setQueryData<SplitLedgerDTO>(key, { ...prev, payments: prev.payments.filter((p) => p.id !== id) });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: refresh,
  });
}

// --- Повторяющиеся ---

export interface RecurringForm {
  description: string;
  category: string;
  /** В валюте группы (для шаблона в иностранной валюте — сегодняшний пересчёт, дальше каждый период считается заново) */
  amountCents: number;
  original?: OriginalAmount | null;
  paidById: string;
  splitMode: SplitMode;
  split: SplitItem[];
  dayOfMonth: number;
  startsOn: string;
  endsOn?: string | null;
}

export function useSaveRecurring(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: ({ id, form }: { id?: string; form: RecurringForm }) =>
      splitApi<SplitRecurringDTO>(id ? `/groups/${groupId}/recurring/${id}` : `/groups/${groupId}/recurring`, {
        method: id ? "PATCH" : "POST",
        body: form,
      }),
    onSettled: refresh,
  });
}

export function useToggleRecurring(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      splitApi<SplitRecurringDTO>(`/groups/${groupId}/recurring/${id}`, { method: "PATCH", body: { active } }),
    onSettled: refresh,
  });
}

export function useDeleteRecurring(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: (id: string) => splitApi<{ ok: true }>(`/groups/${groupId}/recurring/${id}`, { method: "DELETE" }),
    onSettled: refresh,
  });
}

// --- Участники ---

export function useAddMember(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: (data: { displayName: string; emoji?: string; color?: string }) =>
      splitApi<SplitMemberDTO>(`/groups/${groupId}/members`, { method: "POST", body: data }),
    onSettled: refresh,
  });
}

export function useUpdateMember(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; displayName?: string; emoji?: string; color?: string; role?: "owner" }) =>
      splitApi<SplitMemberDTO | { ok: true }>(`/groups/${groupId}/members/${id}`, { method: "PATCH", body: data }),
    onSettled: refresh,
  });
}

export function useRemoveMember(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: (id: string) => splitApi<{ ok: true }>(`/groups/${groupId}/members/${id}`, { method: "DELETE" }),
    onSettled: refresh,
  });
}

// --- Вступление ---

export interface JoinPreview {
  name: string;
  emoji: string;
  color: string;
  currency: string;
  members: { name: string; emoji: string; color: string }[];
  claimable: { id: string; name: string; emoji: string; color: string }[];
}

export const fetchJoinPreview = (code: string) =>
  splitApi<JoinPreview>(`/join?code=${encodeURIComponent(code)}`);

export function useJoinGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, claimMemberId }: { code: string; claimMemberId?: string }) =>
      splitApi<{ groupId: string; alreadyMember?: boolean }>(`/join?code=${encodeURIComponent(code)}`, {
        method: "POST",
        body: claimMemberId ? { claimMemberId } : {},
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: splitKeys.groups }),
  });
}

// --- Напоминания и реквизиты (ADR-0010) ---

/** «Напомнить» должнику. `delivered: false` — у него нет аккаунта: уведомлять некого, клиент отдаёт текст для пересылки. */
export function useRemindDebtor(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: (debtorId: string) =>
      splitApi<{ ok: true; delivered: boolean; cents: number }>(`/groups/${groupId}/remind`, { method: "POST", body: { debtorId } }),
    onSettled: refresh,
  });
}

/** Реквизиты живут в профиле (User.paymentDetails) и едут во все группы и поездки; здесь только быстрый ввод из «Сочтёмся». */
export function useSavePaymentDetails(groupId: string) {
  const qc = useQueryClient();
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async (paymentDetails: string | null) => {
      const r = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentDetails }),
      });
      if (!r.ok) throw new Error("Не удалось сохранить реквизиты");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["user-profile"] });
      void qc.invalidateQueries({ queryKey: ["trip"] });
      refresh();
    },
  });
}
