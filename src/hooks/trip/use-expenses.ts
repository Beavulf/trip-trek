"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Expense } from "@/lib/types";
import { getTripId } from "./trip-id";

export function useExpenses() {
  const tripId = getTripId();
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
    // Всегда возвращаем массив — нет «вечного Загрузка»
    placeholderData: [],
  });
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { amount: number; category: string; description: string; paidById: string; dayId?: string; splitWith?: string[]; excludeSelf?: boolean; settlementKey?: string }) => {
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
    onSuccess: () => {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}
