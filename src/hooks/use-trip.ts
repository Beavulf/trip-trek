"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TripSummary, Day, Photo, Expense, JournalEntry, Weather } from "@/lib/types";

// Сводка поездки
export function useTrip() {
  return useQuery<TripSummary>({
    queryKey: ["trip"],
    queryFn: async () => {
      const r = await fetch("/api/trip");
      if (!r.ok) throw new Error("fetch trip");
      return r.json();
    },
  });
}

export function useDays() {
  return useQuery<Day[]>({
    queryKey: ["days"],
    queryFn: async () => {
      const r = await fetch("/api/days");
      return r.json();
    },
  });
}

export function useUpdatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const r = await fetch(`/api/places/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
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
    mutationFn: async (data: {
      name: string;
      description?: string;
      category: string;
      lat: number;
      lng: number;
      dayId: string;
      timeOfDay?: string;
      budget?: number;
      address?: string;
    }) => {
      const r = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("create place failed");
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
      await fetch(`/api/places/${id}`, { method: "DELETE" });
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

export function usePhotos(dayId?: string, placeId?: string) {
  const params = new URLSearchParams();
  if (dayId) params.set("dayId", dayId);
  if (placeId) params.set("placeId", placeId);
  return useQuery<Photo[]>({
    queryKey: ["photos", dayId, placeId],
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

export function useExpenses() {
  return useQuery<Expense[]>({
    queryKey: ["expenses"],
    queryFn: async () => {
      const r = await fetch("/api/expenses");
      return r.json();
    },
  });
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { amount: number; category: string; description: string; paidById: string; dayId?: string }) => {
      const r = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useJournal(dayId?: string) {
  const params = new URLSearchParams();
  if (dayId) params.set("dayId", dayId);
  return useQuery<JournalEntry[]>({
    queryKey: ["journal", dayId],
    queryFn: async () => {
      const r = await fetch(`/api/journal?${params}`);
      return r.json();
    },
  });
}

export function useAddJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { dayId: string; content: string; mood?: string; participantId?: string }) => {
      const r = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

export function useDeleteJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/journal?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

export function useWeather(city: string, forecast?: number) {
  const params = forecast ? `&forecast=${forecast}` : "";
  return useQuery<Weather>({
    queryKey: ["weather", city, forecast],
    queryFn: async () => {
      const r = await fetch(`/api/weather?city=${city}${params}`);
      return r.json();
    },
    staleTime: 10 * 60 * 1000,
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
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!r.ok) throw new Error("update dates failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip"] });
      qc.invalidateQueries({ queryKey: ["days"] });
    },
  });
}

export function useUpdateParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; budget?: number | null; name?: string; role?: string | null }) => {
      const r = await fetch(`/api/participants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("update participant failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip"] }),
  });
}

// === Checklist ===
export interface ChecklistItem {
  id: string;
  text: string;
  category: string;
  done: boolean;
  order: number;
}

export function useChecklist() {
  return useQuery<ChecklistItem[]>({
    queryKey: ["checklist"],
    queryFn: async () => {
      const r = await fetch("/api/checklist");
      return r.json();
    },
  });
}

export function useToggleChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; done?: boolean; text?: string; category?: string }) => {
      const r = await fetch("/api/checklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist"] }),
  });
}

export function useAddChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ text, category }: { text: string; category: string }) => {
      const r = await fetch("/api/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, category }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist"] }),
  });
}

export function useDeleteChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/checklist?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist"] }),
  });
}

// === Info ===
export interface InfoItem {
  id: string;
  type: string;
  title: string;
  content: string;
  icon: string | null;
  order: number;
}

export function useInfo(type?: string) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  return useQuery<InfoItem[]>({
    queryKey: ["info", type],
    queryFn: async () => {
      const r = await fetch(`/api/info?${params}`);
      return r.json();
    },
  });
}

export function useAddInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { type: string; title: string; content: string; icon?: string }) => {
      const r = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["info"] }),
  });
}

export function useUpdateInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; title?: string; content?: string; icon?: string; type?: string }) => {
      const r = await fetch("/api/info", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["info"] }),
  });
}

export function useDeleteInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/info?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["info"] }),
  });
}

// === Currency ===
export interface CurrencyRates {
  base: string;
  rates: Record<string, number>;
  updated: string | null;
  fallback?: boolean;
}

export function useCurrency() {
  return useQuery<CurrencyRates>({
    queryKey: ["currency"],
    queryFn: async () => {
      const r = await fetch("/api/currency");
      return r.json();
    },
    staleTime: 60 * 60 * 1000, // 1 час
  });
}

// === Phrasebook ===
export interface Phrase {
  id: string;
  category: string;
  ru: string;
  cn: string;
  pinyin: string;
  favorite: boolean;
  order: number;
}

export function usePhrases(category?: string, favoriteOnly?: boolean) {
  const params = new URLSearchParams();
  if (category && category !== "all") params.set("category", category);
  if (favoriteOnly) params.set("favorite", "true");
  return useQuery<Phrase[]>({
    queryKey: ["phrases", category, favoriteOnly],
    queryFn: async () => {
      const r = await fetch(`/api/phrases?${params}`);
      return r.json();
    },
  });
}

export function useTogglePhraseFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, favorite }: { id: string; favorite: boolean }) => {
      const r = await fetch("/api/phrases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, favorite }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["phrases"] }),
  });
}

// === Nearby places (Overpass API) ===
export interface NearbyPlace {
  name: string;
  category: string;
  emoji: string;
  cuisine: string | null;
  address: string | null;
  lat: number;
  lng: number;
  distance: number;
}

export function useNearby(lat: number | null, lng: number | null, category: string, enabled: boolean) {
  return useQuery<{ places: NearbyPlace[]; source?: string; error?: string }>({
    queryKey: ["nearby", lat, lng, category],
    queryFn: async () => {
      const r = await fetch(`/api/nearby?lat=${lat}&lng=${lng}&category=${category}`);
      return r.json();
    },
    enabled: enabled && lat !== null && lng !== null,
    staleTime: 5 * 60 * 1000,
  });
}

// === AI Summary ===
export function useAISummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type }: { type: "summary" | "day" | "tips" }) => {
      const r = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "AI request failed");
      }
      return r.json() as Promise<{ content: string; type: string }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-summary"] }),
  });
}
