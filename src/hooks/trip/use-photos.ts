"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Photo } from "@/lib/types";
import { getTripId } from "./trip-id";

export function usePhotos(dayId?: string, placeId?: string) {
  const params = new URLSearchParams();
  params.set("tripId", getTripId()); // ВСЕГДА фильтруем по текущей поездке
  if (dayId) params.set("dayId", dayId);
  if (placeId) params.set("placeId", placeId);
  return useQuery<Photo[]>({
    queryKey: ["photos", getTripId(), dayId, placeId],
    queryFn: async () => {
      const r = await fetch(`/api/photos?${params}`);
      return r.json();
    },
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
      await fetch(`/api/photos?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}
