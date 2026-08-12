"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId } from "./trip-id";

// === Board (сообщения) ===
export interface BoardMessage {
  id: string;
  content: string;
  userId: string | null;
  user: { id: string; name: string; color: string; emoji: string } | null;
  pinned: boolean;
  createdAt: string;
}

// P0 #2: enabled !!tripId, placeholderData: []
// P1 #8: throw on !ok
export function useBoard() {
  const tripId = getTripId();
  return useQuery<BoardMessage[]>({
    queryKey: ["board", tripId],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/board?tripId=${tripId}`);
      if (!r.ok) throw new Error("fetch board failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tripId,
    placeholderData: [],
  });
}

// P1 #8: throw on !ok — UI ловит в try/catch
export function useAddBoardMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ content, userId }: { content: string; userId?: string }) => {
      const r = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, userId, tripId: getTripId() }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });
}

export function useTogglePinBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const r = await fetch("/api/board", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pinned }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });
}

export function useDeleteBoardMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/board?id=${id}`, { method: "DELETE" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });
}
