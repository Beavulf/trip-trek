"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Photo } from "@/lib/types";
import { queryKeys, invalidateRouteData } from "@/lib/query-keys";
import { getTripId, useCurrentTripId } from "./trip-id";

/** Фото с геометками для карты (жило инлайном в trip-map.tsx до фазы 3 углубления). */
export function usePhotosGeo() {
  const tripId = useCurrentTripId();
  return useQuery<Photo[]>({
    queryKey: queryKeys.photosGeo(tripId),
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/photos/geo?tripId=${tripId}`);
      if (!r.ok) throw new Error("fetch photos-geo failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tripId,
    // Загрузка фото шлёт photo:added → WS-шина инвалидирует ключ; refetch на каждый
    // заход на вкладку карты только перерисовывал сотни маркеров зря.
    staleTime: 60_000,
  });
}

export function usePhotos(dayId?: string, placeId?: string) {
  const tripId = useCurrentTripId();
  const params = new URLSearchParams();
  if (tripId) params.set("tripId", tripId);
  if (dayId) params.set("dayId", dayId);
  if (placeId) params.set("placeId", placeId);
  return useQuery<Photo[]>({
    queryKey: ["photos", tripId, dayId, placeId],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/photos?${params}`);
      if (!r.ok) throw new Error("fetch photos");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
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
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "upload failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      qc.invalidateQueries({ queryKey: ["photos-geo"] });
      invalidateRouteData(qc);
    },
  });
}

export function useUpdatePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const r = await fetch(`/api/photos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "update photo failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      qc.invalidateQueries({ queryKey: ["photos-geo"] });
      invalidateRouteData(qc);
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
      qc.invalidateQueries({ queryKey: ["photos-geo"] });
      invalidateRouteData(qc);
    },
  });
}
