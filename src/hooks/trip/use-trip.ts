"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TripSummary } from "@/lib/types";
import { getTripId } from "./trip-id";

// Сводка поездки
export function useTrip() {
  const tripId = getTripId();
  return useQuery<TripSummary>({
    queryKey: ["trip", tripId],
    queryFn: async () => {
      if (!tripId) throw new Error("no trip selected");
      const r = await fetch(`/api/trip?tripId=${tripId}`);
      if (!r.ok) throw new Error("fetch trip");
      return r.json();
    },
    enabled: !!tripId,
    retry: 1,
  });
}

export function useSetCurrentUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (currentUserId: string) => {
      const r = await fetch("/api/participants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentUserId }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip"] }),
  });
}

export function useUpdateTripDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate?: string; endDate?: string }) => {
      const r = await fetch("/api/trip/dates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: getTripId(), startDate, endDate }),
      });
      if (!r.ok) throw new Error("update dates failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip"] });
      qc.invalidateQueries({ queryKey: ["days"] });
    },
  });
}

export function useUpdateTripBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (totalBudget: number) => {
      const r = await fetch("/api/trip/budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: getTripId(), totalBudget }),
      });
      if (!r.ok) throw new Error("update budget failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip"] }),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, tripId, ...data }: { memberId: string; tripId: string; budget?: number | null; displayName?: string; emoji?: string; color?: string }) => {
      const r = await fetch(`/api/trips/${tripId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("update member failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip"] });
      qc.invalidateQueries({ queryKey: ["budget-plan"] });
    },
  });
}
