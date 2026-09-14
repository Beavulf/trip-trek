"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId } from "./trip-id";
import { invalidateRouteData } from "@/lib/query-keys";
import type { PlannerDayDraft } from "@/lib/planner";

// Хуки ИИ-путешествий: планер маршрута, OSM-рестораны, прогулка рядом и
// батч-создание мест из черновиков. Ошибки сервера всплывают с текстом роута
// («ИИ устал…», лимиты, 403 блока) — компоненты показывают их в toast.

export interface PlannerResult {
  drafts: PlannerDayDraft[];
  city: string | null;
  geoNote: string;
}

export interface PlannerForm {
  mode: "trip" | "day" | "replace";
  dayNumber?: number;
  interests?: string[];
  pace?: "relaxed" | "packed" | null;
  budget?: "low" | "medium" | "any" | null;
  notes?: string;
  exclude?: string[];
}

export function useAiPlanner() {
  return useMutation<PlannerResult, Error, PlannerForm>({
    mutationFn: async (form) => {
      const r = await fetch("/api/ai/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tripId: getTripId() }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `Ошибка ${r.status}`);
      return b as PlannerResult;
    },
  });
}

export interface RestaurantDraft {
  name: string;
  category: string;
  lat: number;
  lng: number;
  address: string | null;
  cuisine: string | null;
  distance: number;
  confidence: "exact";
  why: string;
}

export function useAiRestaurants() {
  return useMutation<{ drafts: RestaurantDraft[]; note?: string }, Error, { dayId: string }>({
    mutationFn: async ({ dayId }) => {
      const r = await fetch("/api/ai/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: getTripId(), dayId }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `Ошибка ${r.status}`);
      return b;
    },
  });
}

export interface WalkStop {
  name: string;
  category: string;
  lat: number;
  lng: number;
  address: string | null;
  startLabel: string | null;
  walkMin: number;
  why: string | null;
}

export interface WalkResult {
  title: string | null;
  stops: WalkStop[];
  note?: string;
}

export function useAiWalk() {
  return useMutation<WalkResult, Error, { lat: number; lng: number; radiusM: number; hours: number; startLabel?: string; preferences?: string }>({
    mutationFn: async (input) => {
      const r = await fetch("/api/ai/walk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, tripId: getTripId() }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `Ошибка ${r.status}`);
      return b as WalkResult;
    },
  });
}

export interface BatchPlaceInput {
  dayId: string;
  name: string;
  category?: string;
  lat: number;
  lng: number;
  timeOfDay?: string | null;
  description?: string | null;
  address?: string | null;
}

/** Черновики → места одним батчем (одна WS-публикация, одна инвалидация). */
export function useCreatePlacesBatch() {
  const qc = useQueryClient();
  return useMutation<{ created: number }, Error, BatchPlaceInput[]>({
    mutationFn: async (places) => {
      const r = await fetch("/api/places/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: getTripId(), places }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `Ошибка ${r.status}`);
      return b;
    },
    onSuccess: () => invalidateRouteData(qc),
  });
}
