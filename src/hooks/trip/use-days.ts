"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Day } from "@/lib/types";
import { getTripId } from "./trip-id";

export function useDays() {
  return useQuery<Day[]>({
    queryKey: ["days"],
    queryFn: async () => {
      const r = await fetch(`/api/days?tripId=${getTripId()}`);
      return r.json();
    },
  });
}

export function useAddDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { city?: string; cityKey?: string; title?: string; accentColor?: string }) => {
      const r = await fetch("/api/days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, tripId: getTripId() }),
      });
      if (!r.ok) throw new Error("add day failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

export function useDeleteDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/days?id=${id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "delete day failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

export function useUpdateDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; city?: string; cityKey?: string; title?: string; summary?: string; accentColor?: string }) => {
      const r = await fetch("/api/days", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      if (!r.ok) throw new Error("update day failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}
