"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId } from "./trip-id";
import { invalidateRouteData } from "@/lib/query-keys";
import type { PlacePatch, PlaceCreateInput } from "@/lib/place-fields";

export function useUpdatePlace() {
  const qc = useQueryClient();
  return useMutation({
    // userName — не поле Place, а подпись автора для WS-события
    mutationFn: async ({ id, ...data }: { id: string } & PlacePatch & { userName?: string }) => {
      const r = await fetch(`/api/places/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "update place failed");
      }
      return r.json();
    },
    onSuccess: () => invalidateRouteData(qc),
  });
}

export function useCreatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: PlaceCreateInput) => {
      const r = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, tripId: getTripId() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "create place failed");
      }
      return r.json();
    },
    onSuccess: () => invalidateRouteData(qc),
  });
}

export function useDeletePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/places/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "delete place failed");
      }
    },
    onSuccess: () => invalidateRouteData(qc),
  });
}

/** Перестановка мест внутри дня (drag&drop): полный порядок id дня одним запросом. */
export function useReorderPlaces() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dayId, placeIds }: { dayId: string; placeIds: string[] }) => {
      const r = await fetch("/api/places/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: getTripId(), dayId, placeIds }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "reorder places failed");
      }
      return r.json();
    },
    onSuccess: () => invalidateRouteData(qc),
  });
}
