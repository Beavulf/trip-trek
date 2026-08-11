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

export function useBoard() {
  return useQuery<BoardMessage[]>({
    queryKey: ["board", getTripId()],
    queryFn: async () => {
      const r = await fetch(`/api/board?tripId=${getTripId()}`);
      return r.json();
    },
  });
}

export function useAddBoardMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ content, userId }: { content: string; userId?: string }) => {
      const r = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, userId, tripId: getTripId() }),
      });
      return r.json();
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
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });
}

export function useDeleteBoardMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/board?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });
}
