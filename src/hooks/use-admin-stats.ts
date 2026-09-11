"use client";

import { useQuery } from "@tanstack/react-query";

export interface AdminStats {
  users: number;
  usersNew7d: number;
  premium: number;
  admins: number;
  trips: number;
  tripsActive: number;
  tripsCompleted: number;
  places: number;
  photos: number;
  expenses: number;
  journals: number;
  messages: number;
  feedback: { new: number; inProgress: number; resolved: number };
  registrations14d: { date: string; count: number }[];
  activity14d: { date: string; photos: number; expenses: number; journals: number }[];
  storage: {
    total: number;
    files: number;
    byKind: Record<string, { bytes: number; files: number }>;
  };
  health: {
    dbLatencyMs: number;
    ai: { source: "user" | "admin" | "env" | "none"; baseUrl: string | null; model: string | null };
    vapid: boolean;
    nodeEnv: string;
    nodeVersion: string;
    uptimeSec: number;
    version: string;
  };
  recent: {
    users: { id: string; name: string; email: string; emoji: string; color: string; avatarUrl: string | null; createdAt: string }[];
    trips: {
      id: string;
      title: string;
      status: string;
      coverEmoji: string;
      coverColor: string;
      createdAt: string;
      _count: { members: number };
    }[];
  };
}

/** Сводка админки: и для «Обзора», и для бейджей в шапке. Опрашивается только у админов. */
export function useAdminStats(enabled: boolean) {
  return useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const r = await fetch("/api/admin/stats");
      if (!r.ok) throw new Error("fetch admin stats failed");
      return r.json();
    },
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
}
