"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId } from "./trip-id";

// === Checklist ===
export interface ChecklistItem {
  id: string;
  text: string;
  category: string;
  done: boolean;
  order: number;
}

// P0 #1: enabled !!tripId, placeholderData: []
// P1 #8: throw on !ok
export function useChecklist() {
  const tripId = getTripId();
  return useQuery<ChecklistItem[]>({
    queryKey: ["checklist", tripId],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/checklist?tripId=${tripId}`);
      if (!r.ok) throw new Error("fetch checklist failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tripId,
    placeholderData: [],
  });
}

// P1 #8: throw on !ok
export function useToggleChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; done?: boolean; text?: string; category?: string }) => {
      const r = await fetch("/api/checklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist"] }),
  });
}

export function useAddChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ text, category }: { text: string; category: string }) => {
      const r = await fetch("/api/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, category, tripId: getTripId() }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist"] }),
  });
}

export function useDeleteChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/checklist?id=${id}`, { method: "DELETE" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist"] }),
  });
}
