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
  language?: string | null;
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

// Создать свою фразу (общая для поездки)
export function useCreatePhrase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tripId: string; ru: string; cn: string; pinyin?: string; category: string; language?: string }) => {
      const r = await fetch("/api/phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || `Ошибка ${r.status}`);
      return body as Phrase;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phrases"] }),
  });
}

// Правка текста/категории фразы
export function useUpdatePhrase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ru?: string; cn?: string; pinyin?: string; category?: string }) => {
      const r = await fetch("/api/phrases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || `Ошибка ${r.status}`);
      return body as Phrase;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phrases"] }),
  });
}

// Удалить фразу
export function useDeletePhrase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const r = await fetch(`/api/phrases?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || `Ошибка ${r.status}`);
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phrases"] }),
  });
}

// Удалить загруженный пак целиком — все фразы языка в поездке
export function useDeletePhraseGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId, language }: { tripId: string; language: string }) => {
      const r = await fetch(
        `/api/phrases?tripId=${encodeURIComponent(tripId)}&language=${encodeURIComponent(language)}`,
        { method: "DELETE" }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || `Ошибка ${r.status}`);
      return body as { ok: boolean; deleted: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phrases"] }),
  });
}

// ИИ-фразы: перевод своей фразы, «ещё фразы» раздела, пак для любого языка.
// 10 запросов в час (лимит сервера) — вызов только по явному действию пользователя.

export interface AiPhraseItem {
  ru: string;
  cn: string;
  pinyin: string;
  category: string;
}

interface AiCommon {
  tripId: string;
  /** код языка (zh, ka...) */
  language?: string;
  /** человекочитаемое имя для промпта («Грузинский») */
  languageName?: string;
}

/** Перевод одной фразы: { cn, pinyin }, в БД не пишет */
export function useAiTranslate() {
  return useMutation({
    mutationFn: async (input: AiCommon & { text: string }) => {
      const r = await fetch("/api/phrases/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, mode: "translate" }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || `Ошибка ${r.status}`);
      return body as { cn: string; pinyin: string };
    },
  });
}

/** Генерация: mode=more (добавить в раздел) или pack (набор для языка) */
export function useAiGenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AiCommon & { mode: "more" | "pack"; category?: string; count?: number }) => {
      const r = await fetch("/api/phrases/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || `Ошибка ${r.status}`);
      return body as { created: number; phrases: AiPhraseItem[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["phrases"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
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
