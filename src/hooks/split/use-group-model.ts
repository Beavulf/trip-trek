"use client";

import { useMemo } from "react";
import { memberBalances, myTotals, pairDebts, type Debt } from "@/lib/split/balances";
import type { SplitExpenseDTO, SplitGroupDTO, SplitMemberDTO, SplitPaymentDTO, SplitRecurringDTO } from "@/lib/split/types";
import { SplitApiError } from "./api";
import { useSplitGroup, useSplitLedger } from "./use-split";

// Вся производная модель экрана группы в одном месте: состав + траты → балансы и долги.
// Считается на клиенте (lib/split/balances — чистые функции с тестами): мутации оптимистичны,
// и баланс обязан двигаться в тот же кадр, что и список, а не после ответа сервера.

export interface GroupModel {
  status: "loading" | "error" | "ready";
  /** HTTP-статус ошибки: 403/404 — группы нет или нет доступа (в отличие от сбоя сети) */
  errorStatus: number | null;
  refetch: () => void;
  group: SplitGroupDTO | null;
  expenses: SplitExpenseDTO[];
  payments: SplitPaymentDTO[];
  recurrings: SplitRecurringDTO[];
  /** Все участники, включая вышедших */
  membersById: Map<string, SplitMemberDTO>;
  /** Активные: их можно выбрать плательщиком/участником новой траты */
  activeMembers: SplitMemberDTO[];
  me: SplitMemberDTO | null;
  /** memberId → итоговый баланс в центах («+» ему должны) */
  balances: Map<string, number>;
  debts: Debt[];
  myOwe: number;
  myOwed: number;
  myBalance: number;
}

const EMPTY_MAP = new Map<string, SplitMemberDTO>();
const EMPTY_BAL = new Map<string, number>();

export function useGroupModel(groupId: string): GroupModel {
  const groupQ = useSplitGroup(groupId);
  const ledgerQ = useSplitLedger(groupId);
  const group = groupQ.data ?? null;
  const ledger = ledgerQ.data;

  return useMemo<GroupModel>(() => {
    const status = groupQ.isError || ledgerQ.isError ? "error" : group && ledger ? "ready" : "loading";
    const failure = groupQ.error ?? ledgerQ.error;
    const errorStatus = failure instanceof SplitApiError ? failure.status : null;
    const refetch = () => {
      void groupQ.refetch();
      void ledgerQ.refetch();
    };
    if (!group || !ledger) {
      return {
        status,
        errorStatus,
        refetch,
        group,
        expenses: [],
        payments: [],
        recurrings: [],
        membersById: EMPTY_MAP,
        activeMembers: [],
        me: null,
        balances: EMPTY_BAL,
        debts: [],
        myOwe: 0,
        myOwed: 0,
        myBalance: 0,
      };
    }
    const membersById = new Map(group.members.map((m) => [m.id, m]));
    const balances = memberBalances(ledger.expenses, ledger.payments);
    const debts = pairDebts(ledger.expenses, ledger.payments);
    const totals = myTotals(debts, group.myMemberId);
    return {
      status,
      errorStatus,
      refetch,
      group,
      expenses: ledger.expenses,
      payments: ledger.payments,
      recurrings: ledger.recurrings,
      membersById,
      activeMembers: group.members.filter((m) => m.status === "active"),
      me: membersById.get(group.myMemberId) ?? null,
      balances,
      debts,
      myOwe: totals.owe,
      myOwed: totals.owed,
      myBalance: balances.get(group.myMemberId) ?? 0,
    };
    // groupQ/ledgerQ — объекты нового вида на каждый рендер; зависим от данных и флагов ошибки
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, ledger, groupQ.isError, ledgerQ.isError]);
}
