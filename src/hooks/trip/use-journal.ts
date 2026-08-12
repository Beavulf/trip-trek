"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { JournalEntry } from "@/lib/types";
import { getTripId, useCurrentTripId } from "./trip-id";

// P0 #2: enabled: !!tripId, без tripId → []
// P1 #7: throw on !ok, placeholderData: []
export function useJournal(dayId?: string) {
  const tripId = useCurrentTripId();
  const params = new URLSearchParams();
  if (tripId) params.set("tripId", tripId);
  if (dayId) params.set("dayId", dayId);
  return useQuery<JournalEntry[]>({
    queryKey: ["journal", tripId, dayId],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/journal?${params}`);
      if (!r.ok) throw new Error("fetch journal failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tripId,
  });
}

// P1 #7: throw on !ok — UI ловит в try/catch, не чистит textarea при fail
export function useAddJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { dayId: string; content: string; mood?: string; userId?: string }) => {
      const r = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, tripId: getTripId() }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body as JournalEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

export function useDeleteJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/journal?id=${id}`, { method: "DELETE" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}
