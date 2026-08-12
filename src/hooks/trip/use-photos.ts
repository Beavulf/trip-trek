"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Photo } from "@/lib/types";
import { getTripId } from "./trip-id";

export function usePhotos(dayId?: string, placeId?: string) {
  const tripId = getTripId();
  const params = new URLSearchParams();
  if (tripId) params.set("tripId", tripId);
  if (dayId) params.set("dayId", dayId);
  if (placeId) params.set("placeId", placeId);
  return useQuery<Photo[]>({
    queryKey: ["photos", tripId, dayId, placeId],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/photos?${params}`);
      return r.json();
    },
    enabled: !!tripId,
  });
}

export function useUploadPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      formData.append("tripId", getTripId());
      const r = await fetch("/api/photos", { method: "POST", body: formData });
      if (!r.ok) throw new Error("upload failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/photos?id=${id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "delete photo failed");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}
