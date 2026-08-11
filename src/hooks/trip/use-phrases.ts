"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId } from "./trip-id";

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

export function usePhrases(category?: string, favoriteOnly?: boolean) {
  const params = new URLSearchParams();
  params.set("tripId", getTripId());
  if (category && category !== "all") params.set("category", category);
  if (favoriteOnly) params.set("favorite", "true");
  return useQuery<Phrase[]>({
    queryKey: ["phrases", getTripId(), category, favoriteOnly],
    queryFn: async () => {
      const r = await fetch(`/api/phrases?${params}`);
      return r.json();
    },
  });
}

export function useTogglePhraseFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, favorite }: { id: string; favorite: boolean }) => {
      const r = await fetch("/api/phrases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, favorite }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phrases"] }),
  });
}
