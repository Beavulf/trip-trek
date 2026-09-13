"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId } from "./trip-id";
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

export function useGeocode() {
  return useMutation({
    mutationFn: async ({ lat, lng }: { lat: number; lng: number }) => {
      const r = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      if (!r.ok) throw new Error("geocode failed");
      return r.json() as Promise<{ address: string; short: string; fallback?: boolean }>;
    },
  });
}
