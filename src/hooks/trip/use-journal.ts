"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { JournalEntry, TripSummary } from "@/lib/types";
import { getTripId, useCurrentTripId } from "./trip-id";

/** Временный id записи, показанной до ответа сервера: открыть/править/удалить такую нельзя, пока она не сохранилась. */
const OPTIMISTIC_PREFIX = "tmp-";
export const isOptimisticJournalId = (id: string): boolean => id.startsWith(OPTIMISTIC_PREFIX);

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
// Оптимистично (отклик): запись появляется в ленте сразу, не дожидаясь сервера, и пропадает,
// если сохранить не вышло; настоящая запись приходит инвалидацией в onSettled и заменяет временную.
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
    onMutate: async (data) => {
      const tripId = getTripId();
      await qc.cancelQueries({ queryKey: ["journal", tripId] });
      const snapshots = qc.getQueriesData<JournalEntry[]>({ queryKey: ["journal", tripId] });
      const trip = qc.getQueryData<TripSummary>(["trip", tripId]);
      const author = [...(trip?.participants ?? []), ...(trip?.formerParticipants ?? [])].find(
        (p) => p.id === data.userId
      );
      const day = trip?.days.find((d) => d.id === data.dayId);
      const optimistic: JournalEntry = {
        id: `${OPTIMISTIC_PREFIX}${Date.now()}`,
        dayId: data.dayId,
        userId: data.userId ?? null,
        user: author
          ? { id: author.id, name: author.name, emoji: author.emoji, color: author.color, avatarUrl: author.avatarUrl ?? null }
          : null,
        day: day ? { dayNumber: day.dayNumber, city: day.city } : null,
        mood: data.mood ?? null,
        content: data.content,
        createdAt: new Date().toISOString(),
      };
      // ключи вида ["journal", tripId, dayId?]: запись кладём в общий список и в список своего дня
      for (const [key, list] of snapshots) {
        if (!Array.isArray(list)) continue;
        const dayFilter = key[2];
        if (dayFilter && dayFilter !== data.dayId) continue;
        qc.setQueryData<JournalEntry[]>(key, [optimistic, ...list]);
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, list]) => qc.setQueryData(key, list));
    },
    onSettled: () => {
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

// Правка записи: контент / настроение / день (PATCH)
export function useEditJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: string; content?: string; mood?: string | null; dayId?: string }) => {
      const r = await fetch("/api/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body as JournalEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal"] });
    },
  });
}
