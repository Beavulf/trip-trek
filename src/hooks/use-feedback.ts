"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeedbackMessageDto } from "@/lib/feedback-server";
import type { FeedbackStatus, FeedbackType } from "@/lib/feedback";

// Слой данных обратной связи для автора. Админка ходит в свои роуты из components/admin.

export interface MyFeedbackItem {
  id: string;
  type: FeedbackType;
  status: FeedbackStatus;
  screenshotUrl: string | null;
  createdAt: string;
  lastActivityAt: string;
  messagesCount: number;
  unread: boolean;
  preview: { author: "user" | "admin"; body: string };
}

export interface MyFeedbackDetail {
  id: string;
  type: FeedbackType;
  status: FeedbackStatus;
  screenshotUrl: string | null;
  createdAt: string;
  thread: FeedbackMessageDto[];
}

async function readError(r: Response, fallback: string): Promise<Error> {
  const json = await r.json().catch(() => ({}));
  return new Error((json as { error?: string }).error || fallback);
}

/** Число обращений с непрочитанным ответом — точка у пункта меню. Лёгкий запрос без списка. */
export function useFeedbackUnread(enabled: boolean) {
  return useQuery<number>({
    queryKey: ["feedback-unread"],
    queryFn: async () => {
      const r = await fetch("/api/feedback/mine?summary=1");
      if (!r.ok) throw new Error("fetch unread failed");
      return ((await r.json()) as { unread: number }).unread;
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMyFeedback(enabled: boolean) {
  return useQuery<{ items: MyFeedbackItem[]; unread: number }>({
    queryKey: ["feedback-mine"],
    queryFn: async () => {
      const r = await fetch("/api/feedback/mine");
      if (!r.ok) throw new Error("fetch mine failed");
      return r.json();
    },
    enabled,
    staleTime: 15_000,
  });
}

export function useFeedbackDetail(id: string | null) {
  const qc = useQueryClient();
  return useQuery<MyFeedbackDetail>({
    queryKey: ["feedback-detail", id],
    queryFn: async () => {
      const r = await fetch(`/api/feedback/${id}`);
      if (!r.ok) throw await readError(r, "Не удалось открыть обращение");
      const data = (await r.json()) as MyFeedbackDetail;
      // сервер пометил ответы прочитанными — точка и список должны это увидеть
      void qc.invalidateQueries({ queryKey: ["feedback-unread"] });
      void qc.invalidateQueries({ queryKey: ["feedback-mine"] });
      return data;
    },
    enabled: !!id,
    staleTime: 10_000,
    // ответ админа может прийти, пока шит открыт
    refetchInterval: 30_000,
  });
}

export function useSendFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: FormData) => {
      const r = await fetch("/api/feedback", { method: "POST", body: form });
      if (!r.ok) throw await readError(r, "Не удалось отправить");
      return (await r.json()) as { id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback-mine"] }),
  });
}

export function useReplyFeedback(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const r = await fetch(`/api/feedback/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!r.ok) throw await readError(r, "Не удалось отправить");
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["feedback-detail", id] });
      void qc.invalidateQueries({ queryKey: ["feedback-mine"] });
    },
  });
}
