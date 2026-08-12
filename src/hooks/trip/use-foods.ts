"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId, useCurrentTripId } from "./trip-id";

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

// P0 #2: enabled !!tripId, placeholderData: []
// P1 #5: throw on !ok
export function useFoods(city?: string) {
  const tripId = useCurrentTripId();
  const params = new URLSearchParams();
  if (tripId) params.set("tripId", tripId);
  if (city && city !== "all") params.set("city", city);
  return useQuery<FoodItem[]>({
    queryKey: ["foods", tripId, city],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/foods?${params}`);
      if (!r.ok) throw new Error("fetch foods failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tripId,
  });
}

// P1 #5: throw on !ok — UI ловит в try/catch
export function useUpdateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; tried?: boolean; rating?: number | null }) => {
      const r = await fetch("/api/foods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
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
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["foods"] }),
  });
}

// P0 #1: delete hook уже был, но throw on !ok добавлен
export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/foods?id=${id}`, { method: "DELETE" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
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
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["foods"] }),
  });
}
