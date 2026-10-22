"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lodging } from "@/lib/lodging";
import { getTripId, useCurrentTripId } from "./trip-id";

// === Проживание (вкладка «Жильё») ===
// Даты в запросах — ключи ГГГГ-ММ-ДД (календарные, без пояса), в ответах — ISO полдень UTC.

export type { Lodging };

/** Поля формы: всё, кроме служебных id/tripId; даты — ключами ГГГГ-ММ-ДД. */
export type LodgingInput = Partial<Omit<Lodging, "id" | "tripId" | "checkIn" | "checkOut">> & {
  name?: string;
  checkIn?: string;
  checkOut?: string;
};

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Ошибка ${r.status}`);
  return data as T;
}

export function useLodgings() {
  const tripId = useCurrentTripId();
  return useQuery<Lodging[]>({
    queryKey: ["lodgings", tripId],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/lodgings?tripId=${tripId}`);
      if (!r.ok) throw new Error("fetch lodgings failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tripId,
  });
}

export function useCreateLodging() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LodgingInput) => send<Lodging>("/api/lodgings", "POST", { ...input, tripId: getTripId() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lodgings"] }),
  });
}

export function useUpdateLodging() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: LodgingInput & { id: string }) => send<Lodging>("/api/lodgings", "PATCH", { id, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lodgings"] }),
  });
}

export function useDeleteLodging() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send<{ ok: true }>(`/api/lodgings?id=${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lodgings"] }),
  });
}
