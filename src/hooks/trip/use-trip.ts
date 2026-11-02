"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TripSummary } from "@/lib/types";
import { calculateCurrentDayNumber } from "@/lib/trip-days";
import { getTripId, useCurrentTripId } from "./trip-id";

/**
 * Номер дня считаем на устройстве: на сервере часы в UTC, и в Китае до 08:00 приходил вчерашний день.
 * Запрос повторяется при возврате в приложение, поэтому к утру номер обновится сам.
 */
function withDeviceDay(trip: TripSummary): TripSummary {
  const currentDayNumber = calculateCurrentDayNumber(trip.settings.startDate, trip.settings.totalDays);
  const dayProgress = trip.settings.totalDays > 0 ? Math.min(100, Math.round((currentDayNumber / trip.settings.totalDays) * 100)) : 0;
  return { ...trip, currentDayNumber, dayProgress };
}

// Сводка поездки
export function useTrip() {
  const tripId = useCurrentTripId();
  return useQuery<TripSummary>({
    queryKey: ["trip", tripId],
    queryFn: async () => {
      if (!tripId) throw new Error("no trip selected");
      const r = await fetch(`/api/trip?tripId=${tripId}`);
      if (!r.ok) throw new Error("fetch trip");
      return withDeviceDay(await r.json());
    },
    enabled: !!tripId,
    retry: 1,
  });
}

export function useSetCurrentUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (currentUserId: string) => {
      const r = await fetch("/api/participants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentUserId }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip"] }),
  });
}

export function useUpdateTripDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate?: string; endDate?: string }) => {
      const r = await fetch("/api/trip/dates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: getTripId(), startDate, endDate }),
      });
      if (!r.ok) throw new Error("update dates failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

// Статус поездки (planning/active/completed). Меняет только владелец —
// гард в PATCH /api/trip; completed ставится из баннера-финала поездки
export function useSetTripStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: "planning" | "active" | "completed") => {
      const r = await fetch(`/api/trip?tripId=${encodeURIComponent(getTripId())}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Не удалось обновить статус поездки");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

export function useUpdateTripBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (totalBudget: number) => {
      const r = await fetch("/api/trip/budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: getTripId(), totalBudget }),
      });
      if (!r.ok) throw new Error("update budget failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip"] }),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, tripId, ...data }: { memberId: string; tripId: string; budget?: number | null; displayName?: string; emoji?: string; color?: string }) => {
      const r = await fetch(`/api/trips/${tripId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("update member failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip"] });
      qc.invalidateQueries({ queryKey: ["budget-plan"] });
    },
  });
}
