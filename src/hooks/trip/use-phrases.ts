"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId, useCurrentTripId } from "./trip-id";

// === Phrasebook ===
export interface Phrase {
  id: string;
  category: string;
  ru: string;
  cn: string;
  pinyin: string;
  favorite: boolean;
  order: number;
}

// P0 #1: enabled !!tripId, placeholderData: []
// P1 #8: throw on !ok
export function usePhrases(category?: string, favoriteOnly?: boolean) {
  const tripId = useCurrentTripId();
  const params = new URLSearchParams();
  if (tripId) params.set("tripId", tripId);
  if (category && category !== "all") params.set("category", category);
  if (favoriteOnly) params.set("favorite", "true");
  return useQuery<Phrase[]>({
    queryKey: ["phrases", tripId, category, favoriteOnly],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/phrases?${params}`);
      if (!r.ok) throw new Error("fetch phrases failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tripId,
  });
}

// P1 #8: throw on !ok — UI ловит в try/catch
export function useTogglePhraseFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, favorite }: { id: string; favorite: boolean }) => {
      const r = await fetch("/api/phrases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, favorite }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phrases"] }),
  });
}

// P0 #3: generate hook — UI вызывает POST /api/phrases/generate
// P1 #12: throw on !ok; race guard на сервере (count check)
export function useGeneratePhrases() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId, language, cityName }: { tripId: string; language: string; cityName?: string }) => {
      const r = await fetch("/api/phrases/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, language, cityName }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body as { created: number; language: string; message: string; total?: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["phrases"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}
