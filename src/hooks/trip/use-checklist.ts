"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId, useCurrentTripId } from "./trip-id";
import { fetchWithOfflineCopy } from "@/lib/offline-copy";

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
  const tripId = useCurrentTripId();
  return useQuery<ChecklistItem[]>({
    queryKey: ["checklist", tripId],
    queryFn: async () => {
      if (!tripId) return [];
      return fetchWithOfflineCopy<ChecklistItem[]>("checklist", tripId, () => fetch(`/api/checklist?tripId=${tripId}`), async (r) => {
        if (!r.ok) throw new Error("fetch checklist failed");
        const data = await r.json();
        return Array.isArray(data) ? data : [];
      });
    },
    enabled: !!tripId,
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
    // Отметка видна сразу: на слабой сети пункт иначе висел неотмеченным до ответа сервера
    onMutate: async ({ id, ...patch }) => {
      const key = ["checklist", getTripId()];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ChecklistItem[]>(key);
      qc.setQueryData<ChecklistItem[]>(key, (items) => items?.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      return { key, previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["checklist"] }),
  });
}

export function useAddChecklist() {
  const qc = useQueryClient();
  return useMutation({
    /** Несколько пунктов — одним запросом: шаблон на 30 пунктов целиком сохранится или не сохранится */
    mutationFn: async (items: { text: string; category: string }[]) => {
      const r = await fetch("/api/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, tripId: getTripId() }),
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
