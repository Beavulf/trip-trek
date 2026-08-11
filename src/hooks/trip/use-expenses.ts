"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Expense } from "@/lib/types";
import { getTripId } from "./trip-id";

export function useExpenses() {
  return useQuery<Expense[]>({
    queryKey: ["expenses", getTripId()],
    queryFn: async () => {
      const r = await fetch(`/api/expenses?tripId=${getTripId()}`);
      return r.json();
    },
  });
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { amount: number; category: string; description: string; paidById: string; dayId?: string; splitWith?: string[]; excludeSelf?: boolean }) => {
      const r = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, tripId: getTripId() }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}
