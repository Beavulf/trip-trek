"use client";

import { useQuery } from "@tanstack/react-query";

export interface AiStatus {
  /** Есть ключ и ИИ не заблокирован админом */
  available: boolean;
  blocked: boolean;
  source: "user" | "admin" | "env" | "none";
}

/** Работает ли ИИ у текущего пользователя (есть ли ключ). Ошибка запроса → данных нет, UI ничего не утверждает. */
export function useAiStatus() {
  return useQuery<AiStatus>({
    queryKey: ["ai-status"],
    queryFn: async () => {
      const r = await fetch("/api/ai/status");
      if (!r.ok) throw new Error("fetch ai status failed");
      return r.json();
    },
    staleTime: 30_000,
    // Ключ добавляют на другой странице (/profile) и возвращаются сюда: статус нужен свежий
    refetchOnMount: "always",
  });
}
