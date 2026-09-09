"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId, useCurrentTripId } from "./trip-id";

// === Board (чат поездки) ===
export interface BoardMessageUser {
  id: string;
  name: string;
  color: string;
  emoji: string;
}

export interface BoardMessage {
  id: string;
  content: string;
  userId: string | null;
  user: BoardMessageUser | null;
  pinned: boolean;
  reactions: Record<string, string[]>; // emoji → userIds (распарсено из JSON-строки)
  editedAt: string | null;
  replyToId: string | null;
  replyTo: {
    id: string;
    content: string;
    user: BoardMessageUser | null;
  } | null;
  createdAt: string;
  /** Клиентский флаг оптимистичной вставки (сообщение ещё на сервере) */
  pending?: boolean;
}

const MAX_LEN = 4000;

function parseReactions(raw: unknown): Record<string, string[]> {
  // API может отдать уже распарсенный объект или JSON-строку — принимаем оба вида
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
    }
    return out;
  }
  if (typeof raw !== "string" || !raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function normalize(msg: Record<string, unknown>): BoardMessage {
  const replyTo = msg.replyTo as Record<string, unknown> | null | undefined;
  return {
    ...(msg as unknown as BoardMessage),
    reactions: parseReactions(msg.reactions),
    replyTo: replyTo
      ? {
          id: String(replyTo.id),
          content: String(replyTo.content ?? ""),
          user: (replyTo.user as BoardMessageUser | null) ?? null,
        }
      : null,
  };
}

// Чат-поток: по возрастанию времени. enabled !!tripId.
export function useBoard() {
  const tripId = useCurrentTripId();
  return useQuery<BoardMessage[]>({
    queryKey: ["board", tripId],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/board?tripId=${tripId}`);
      if (!r.ok) throw new Error("fetch board failed");
      const data = await r.json();
      return Array.isArray(data) ? data.map(normalize) : [];
    },
    enabled: !!tripId,
  });
}

export interface SendBoardArgs {
  content: string;
  replyToId?: string | null;
  /** Автор для оптимистичной вставки (из сессии + участники поездки) */
  author?: BoardMessageUser | null;
}

// Отправка с оптимистичной вставкой: пузырь появляется мгновенно,
// при ошибке — откат + тост в компоненте.
export function useAddBoardMessage() {
  const qc = useQueryClient();
  const tripId = useCurrentTripId();
  return useMutation({
    mutationFn: async ({ content, replyToId }: SendBoardArgs) => {
      const r = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, replyToId: replyToId || undefined, tripId: getTripId() }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || `Ошибка ${r.status}`);
      return body;
    },
    onMutate: async ({ content, replyToId, author }) => {
      if (!tripId) return;
      await qc.cancelQueries({ queryKey: ["board", tripId] });
      const prev = qc.getQueryData<BoardMessage[]>(["board", tripId]);
      const temp: BoardMessage = {
        id: `temp-${Date.now()}`,
        content,
        userId: author?.id ?? null,
        user: author ?? null,
        pinned: false,
        reactions: {},
        editedAt: null,
        replyToId: replyToId ?? null,
        replyTo: null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      // Цитату для оптимистичного пузыря подтягиваем из кэша
      if (replyToId && prev) {
        const parent = prev.find((m) => m.id === replyToId);
        if (parent) temp.replyTo = { id: parent.id, content: parent.content, user: parent.user };
      }
      qc.setQueryData<BoardMessage[]>(["board", tripId], (old) => [...(old || []), temp]);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev && tripId) qc.setQueryData(["board", tripId], ctx.prev);
    },
    onSettled: () => {
      if (tripId) qc.invalidateQueries({ queryKey: ["board", tripId] });
    },
  });
}

// Редактирование своего сообщения
export function useEditBoardMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const r = await fetch("/api/board", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || `Ошибка ${r.status}`);
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });
}

// Тогл своей реакции
export function useToggleBoardReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reaction }: { id: string; reaction: string }) => {
      const r = await fetch("/api/board", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reaction }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || `Ошибка ${r.status}`);
      return body;
    },
    onMutate: async ({ id, reaction }) => {
      const tripId = getTripId();
      if (!tripId) return;
      await qc.cancelQueries({ queryKey: ["board", tripId] });
      const prev = qc.getQueryData<BoardMessage[]>(["board", tripId]);
      // userId берём из localStorage (use-auth его кладёт) — оптимистичный тогл
      const myId = typeof window !== "undefined" ? localStorage.getItem("triptrek-current-user-id") : null;
      if (!myId || !prev) return { prev: undefined };
      qc.setQueryData<BoardMessage[]>(["board", tripId], (old) =>
        (old || []).map((m) => {
          if (m.id !== id) return m;
          const set = new Set(m.reactions[reaction] || []);
          if (set.has(myId)) set.delete(myId);
          else set.add(myId);
          const next = { ...m.reactions };
          if (set.size > 0) next[reaction] = [...set];
          else delete next[reaction];
          return { ...m, reactions: next };
        })
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      const tripId = getTripId();
      if (ctx?.prev && tripId) qc.setQueryData(["board", tripId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["board"] }),
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

export { MAX_LEN as BOARD_MAX_LEN };
