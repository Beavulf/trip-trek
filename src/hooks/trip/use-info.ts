"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId, useCurrentTripId } from "./trip-id";
import { fetchWithOfflineCopy } from "@/lib/offline-copy";

// === Info ===
export interface InfoItem {
  id: string;
  type: string;
  title: string;
  content: string;
  icon: string | null;
  order: number;
}

// P0 #1: enabled !!tripId, placeholderData: []
// P1 #8: throw on !ok
export function useInfo() {
  const tripId = useCurrentTripId();
  return useQuery<InfoItem[]>({
    queryKey: ["info", tripId],
    queryFn: async () => {
      if (!tripId) return [];
      return fetchWithOfflineCopy<InfoItem[]>("info", tripId, () => fetch(`/api/info?tripId=${tripId}`), async (r) => {
        if (!r.ok) throw new Error("fetch info failed");
        const data = await r.json();
        return Array.isArray(data) ? data : [];
      });
    },
    enabled: !!tripId,
  });
}

// P0 #5: tripId in body (was missing → always 400); P1 #8: throw on !ok
export function useAddInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { type: string; title: string; content: string; icon?: string }) => {
      const r = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, tripId: getTripId() }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["info"] }),
  });
}

export function useUpdateInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; title?: string; content?: string; icon?: string; type?: string }) => {
      const r = await fetch("/api/info", {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["info"] }),
  });
}

export function useDeleteInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/info?id=${id}`, { method: "DELETE" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["info"] }),
  });
}
