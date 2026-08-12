"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId } from "./trip-id";

// === Info ===
export interface InfoItem {
  id: string;
  type: string;
  title: string;
  content: string;
  icon: string | null;
  order: number;
}

export function useInfo(type?: string) {
  const params = new URLSearchParams();
  params.set("tripId", getTripId());
  if (type) params.set("type", type);
  return useQuery<InfoItem[]>({
    queryKey: ["info", getTripId(), type],
    queryFn: async () => {
      const r = await fetch(`/api/info?${params}`);
      return r.json();
    },
  });
}

export function useAddInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { type: string; title: string; content: string; icon?: string }) => {
      const r = await fetch(`/api/info?tripId=${getTripId()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["info"] }),
  });
}

export function useUpdateInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; title?: string; content?: string; icon?: string; type?: string }) => {
      const r = await fetch(`/api/info?tripId=${getTripId()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["info"] }),
  });
}

export function useDeleteInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/info?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["info"] }),
  });
}
