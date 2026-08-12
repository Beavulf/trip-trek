"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId, useCurrentTripId } from "./trip-id";

// === Budget Plan ===
export interface BudgetPlan {
  id: string;
  category: string;
  amount: number;
}

export function useBudgetPlan() {
  const tripId = useCurrentTripId();
  return useQuery<BudgetPlan[]>({
    queryKey: ["budget-plan", tripId],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/budget-plan?tripId=${tripId}`);
      if (!r.ok) throw new Error("fetch budget-plan failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tripId,
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
