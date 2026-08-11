"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId } from "./trip-id";

// === Budget Plan ===
export interface BudgetPlan {
  id: string;
  category: string;
  amount: number;
}

export function useBudgetPlan() {
  return useQuery<BudgetPlan[]>({
    queryKey: ["budget-plan", getTripId()],
    queryFn: async () => {
      const r = await fetch(`/api/budget-plan?tripId=${getTripId()}`);
      return r.json();
    },
  });
}

export function useUpdateBudgetPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ category, amount }: { category: string; amount: number }) => {
      const r = await fetch("/api/budget-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, amount, tripId: getTripId() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "update failed");
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget-plan"] }),
  });
}
