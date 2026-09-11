"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface UserNotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

export function useNotifications(enabled: boolean) {
  return useQuery<{ items: UserNotificationItem[]; unread: number }>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const r = await fetch("/api/notifications");
      if (!r.ok) throw new Error("fetch notifications failed");
      return r.json();
    },
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts: { ids?: string[]; all?: boolean }) => {
      const r = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (!r.ok) throw new Error("mark read failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
