"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId } from "./trip-id";

// === Food Guide ===
export interface FoodItem {
  id: string;
  name: string;
  nameCn: string | null;
  description: string;
  city: string;
  place: string | null;
  price: string | null;
  emoji: string | null;
  imageUrl: string | null;
  tried: boolean;
  rating: number | null;
  order: number;
}

export function useFoods(city?: string) {
  const params = new URLSearchParams();
  params.set("tripId", getTripId()); // ВСЕГДА фильтруем по поездке
  if (city && city !== "all") params.set("city", city);
  return useQuery<FoodItem[]>({
    queryKey: ["foods", getTripId(), city],
    queryFn: async () => {
      const r = await fetch(`/api/foods?${params}`);
      return r.json();
    },
  });
}

export function useUpdateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; tried?: boolean; rating?: number | null }) => {
      const r = await fetch("/api/foods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["foods"] }),
  });
}

export function useAddFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; nameCn?: string; description?: string; city: string; place?: string; price?: string; emoji?: string }) => {
      const r = await fetch("/api/foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, tripId: getTripId() }),
      });
      if (!r.ok) throw new Error("add food failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["foods"] }),
  });
}

export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/foods?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["foods"] }),
  });
}

export function useUploadFoodPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("id", id);
      const r = await fetch("/api/foods", { method: "PATCH", body: fd });
      if (!r.ok) throw new Error("upload failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["foods"] }),
  });
}
