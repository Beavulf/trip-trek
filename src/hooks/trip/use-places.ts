"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getTripId } from "./trip-id";
import { invalidateRouteData, queryKeys } from "@/lib/query-keys";
import type { PlacePatch, PlaceCreateInput } from "@/lib/place-fields";
import { placeRestorePayload } from "@/lib/place-undo";
import { trackFirstUserPlaceAdded } from "@/lib/trip-analytics";

// Запись места в read-модели маршрута (кэш ["route"]) — нас интересует только поиск по id
type PlaceLike = Record<string, unknown>;

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
      return r.json() as Promise<{ firstUserPlaceAdded?: boolean }>;
    },
    onSuccess: (data) => {
      if (data.firstUserPlaceAdded) trackFirstUserPlaceAdded();
      invalidateRouteData(qc);
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
    // Снапшот read-модели маршрута: из неё собирается payload восстановления
    onMutate: async (id) => {
      const key = queryKeys.route(getTripId());
      await qc.cancelQueries({ queryKey: key });
      const data = qc.getQueryData<{ days: { places: PlaceLike[] }[] }>(key);
      const removed = data?.days.flatMap((d) => d.places).find((p) => p.id === id) ?? null;
      return { removed };
    },
    onSuccess: (_res, _id, ctx) => {
      invalidateRouteData(qc);
      const removed = ctx?.removed;
      if (!removed) return;
      // sonner не дисейблит action — защита от двойного POST (как в use-expenses)
      let restoring = false;
      toast.success("Место удалено", {
        description: "Фото места не привяжутся обратно",
        duration: 8000,
        action: {
          label: "Вернуть",
          onClick: () => {
            if (restoring) return;
            restoring = true;
            fetch("/api/places", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...placeRestorePayload(removed), tripId: getTripId() }),
            })
              .then(async (r) => {
                if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `Ошибка ${r.status}`);
                toast.success("Место возвращено");
              })
              .catch((e) => toast.error("Не удалось вернуть", { description: e instanceof Error ? e.message : undefined }))
              .finally(() => invalidateRouteData(qc));
          },
        },
      });
    },
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
