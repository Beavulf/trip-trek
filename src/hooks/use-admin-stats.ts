"use client";

import { useQuery } from "@tanstack/react-query";

export interface AdminStats {
  users: number;
  usersNew7d: number;
  premium: number;
  trips: number;
  places: number;
  photos: number;
  expenses: number;
  feedback: { new: number; inProgress: number; resolved: number };
  registrations14d: { date: string; count: number }[];
}

/** Сводка админки: и для вкладки «Обзор», и для бейджей в шапке. Опрашивается только у админов. */
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
