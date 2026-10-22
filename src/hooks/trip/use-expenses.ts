"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Expense, Participant, TripSummary } from "@/lib/types";
import { getTripId, useCurrentTripId } from "./trip-id";

/** Временный id записи, показанной до ответа сервера: удалить такую строку нельзя, пока она не сохранилась. */
const OPTIMISTIC_PREFIX = "tmp-";
export const isOptimisticExpenseId = (id: string): boolean => id.startsWith(OPTIMISTIC_PREFIX);

export function useExpenses() {
  const tripId = useCurrentTripId();
  return useQuery<Expense[]>({
    queryKey: ["expenses", tripId],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/expenses?tripId=${tripId}`);
      if (!r.ok) throw new Error("fetch expenses failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tripId,
  });
}

interface NewExpense {
  amount: number;
  category: string;
  description: string;
  paidById: string;
  dayId?: string;
  splitWith?: string[];
  excludeSelf?: boolean;
  settlementKey?: string;
  originalAmount?: number;
  originalCurrency?: string;
}

// Оптимистичное обновление (отклик): трата/перевод появляется в списке сразу, не дожидаясь сервера
// и повторной загрузки; при ошибке (в т.ч. 409 «перевод больше долга») список откатывается.
// Настоящая запись приходит инвалидацией в onSettled и заменяет временную.
export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: NewExpense) => {
      const r = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, tripId: getTripId() }),
      });
      // Бросаем на !ok чтобы UI не показывал фейковый success-toast
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body as Expense;
    },
    onMutate: async (data) => {
      const tripId = getTripId();
      const key = ["expenses", tripId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Expense[]>(key);
      if (prev) {
        const trip = qc.getQueryData<TripSummary>(["trip", tripId]);
        const payer: Participant | undefined = [...(trip?.participants ?? []), ...(trip?.formerParticipants ?? [])].find(
          (p) => p.id === data.paidById
        );
        const day = data.dayId ? trip?.days.find((d) => d.id === data.dayId) : undefined;
        const optimistic: Expense = {
          id: `${OPTIMISTIC_PREFIX}${Date.now()}`,
          amount: data.amount,
          category: data.category,
          description: data.description,
          paidById: data.paidById,
          paidBy: payer ?? { id: data.paidById, name: "…", color: "#94a3b8", emoji: "👤", role: null, budget: null },
          dayId: data.dayId ?? null,
          day: day ? { dayNumber: day.dayNumber, city: day.city } : null,
          splitWith: (data.splitWith ?? []).join(","),
          excludeSelf: !!data.excludeSelf,
          originalAmount: data.originalAmount ?? null,
          originalCurrency: data.originalCurrency ?? null,
          createdAt: new Date().toISOString(),
        };
        qc.setQueryData<Expense[]>(key, [optimistic, ...prev]);
      }
      return { key, prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    // Строка исчезает сразу (с анимацией в списке); не удалось — возвращается на место
    onMutate: async (id) => {
      const key = ["expenses", getTripId()];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Expense[]>(key);
      if (prev) qc.setQueryData<Expense[]>(key, prev.filter((e) => e.id !== id));
      return { key, prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}
