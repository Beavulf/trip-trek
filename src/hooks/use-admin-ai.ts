"use client";

import { useQuery } from "@tanstack/react-query";

// Статистика ИИ для раздела /admin/ai. Один источник для табло, графика,
// таблицы юзеров и журнала последних вызовов.

export interface AdminAiUserRow {
  id: string;
  name: string;
  email: string;
  emoji: string;
  color: string;
  avatarUrl: string | null;
  aiBlocked: boolean;
  alertedToday: boolean;
  callsToday: number;
  tokensToday: number;
  calls7d: number;
  tokens7d: number;
  keySource: string;
  lastUsedAt: string;
  overThreshold: boolean;
}

export interface AdminAiData {
  today: { calls: number; tokens: number; users: number };
  week: { calls: number; tokens: number };
  series14d: {
    date: string;
    calls: Record<string, number>;
    tokens: Record<string, number>;
    totalCalls: number;
    totalTokens: number;
  }[];
  thresholds: { calls: number; tokens: number };
  users: AdminAiUserRow[];
  recent: {
    id: string;
    createdAt: string;
    feature: string;
    keySource: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
    ok: boolean;
    error: string | null;
    tripId: string | null;
    user: { id: string; name: string; emoji: string; color: string; avatarUrl: string | null } | null;
  }[];
}

export function useAdminAi() {
  return useQuery<AdminAiData>({
    queryKey: ["admin-ai"],
    queryFn: async () => {
      const r = await fetch("/api/admin/ai");
      if (!r.ok) throw new Error("fetch admin ai failed");
      return r.json();
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}
