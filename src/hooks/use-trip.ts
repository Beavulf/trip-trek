"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TripSummary, Day, Photo, Expense, JournalEntry, Weather } from "@/lib/types";

// Текущий tripId (из localStorage)
export function getTripId(): string {
  if (typeof window === "undefined") return "default-trip";
  return localStorage.getItem("triptrek-current-trip") || "default-trip";
}

export function setTripId(id: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("triptrek-current-trip", id);
  }
}

// Сводка поездки
export function useTrip() {
  return useQuery<TripSummary>({
    queryKey: ["trip"],
    queryFn: async () => {
      const r = await fetch(`/api/trip?tripId=${getTripId()}`);
      if (!r.ok) throw new Error("fetch trip");
      return r.json();
    },
  });
}

export function useDays() {
  return useQuery<Day[]>({
    queryKey: ["days"],
    queryFn: async () => {
      const r = await fetch(`/api/days?tripId=${getTripId()}`);
      return r.json();
    },
  });
}

export function useAddDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { city?: string; cityKey?: string; title?: string; accentColor?: string }) => {
      const r = await fetch("/api/days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, tripId: getTripId() }),
      });
      if (!r.ok) throw new Error("add day failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

export function useDeleteDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/days?id=${id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "delete day failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
  });
}

export function useUpdateDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; city?: string; cityKey?: string; title?: string; summary?: string; accentColor?: string }) => {
      const r = await fetch("/api/days", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      if (!r.ok) throw new Error("update day failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
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

export function useExpenses() {
  return useQuery<Expense[]>({
    queryKey: ["expenses", getTripId()],
    queryFn: async () => {
      const r = await fetch(`/api/expenses?tripId=${getTripId()}`);
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
        body: JSON.stringify({ ...data, tripId: getTripId() }),
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
  params.set("tripId", getTripId());
  if (dayId) params.set("dayId", dayId);
  return useQuery<JournalEntry[]>({
    queryKey: ["journal", getTripId(), dayId],
    queryFn: async () => {
      const r = await fetch(`/api/journal?${params}`);
      return r.json();
    },
  });
}

export function useAddJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { dayId: string; content: string; mood?: string; userId?: string }) => {
      const r = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, tripId: getTripId() }),
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

// Погода по координатам (для любых городов)
export function useWeatherByCoords(lat: number, lng: number, name: string, timezone?: string, forecast?: number) {
  const params = new URLSearchParams();
  params.set("lat", String(lat));
  params.set("lng", String(lng));
  params.set("name", name);
  if (timezone) params.set("timezone", timezone);
  if (forecast) params.set("forecast", String(forecast));
  return useQuery<Weather>({
    queryKey: ["weather-coords", lat, lng, name, timezone, forecast],
    queryFn: async () => {
      const r = await fetch(`/api/weather?${params}`);
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
        body: JSON.stringify({ tripId: getTripId(), startDate, endDate }),
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
    queryKey: ["checklist", getTripId()],
    queryFn: async () => {
      const r = await fetch(`/api/checklist?tripId=${getTripId()}`);
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
  params.set("tripId", getTripId());
  if (type) params.set("type", type);
  return useQuery<InfoItem[]>({
    queryKey: ["info", getTripId(), type],
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
      const r = await fetch(`/api/info?tripId=${getTripId()}`, {
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
      const r = await fetch(`/api/info?tripId=${getTripId()}`, {
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
  params.set("tripId", getTripId());
  if (category && category !== "all") params.set("category", category);
  if (favoriteOnly) params.set("favorite", "true");
  return useQuery<Phrase[]>({
    queryKey: ["phrases", getTripId(), category, favoriteOnly],
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

// === Budget Plan ===
export interface BudgetPlan {
  id: string;
  category: string;
  amount: number;
}

export function useBudgetPlan() {
  return useQuery<BudgetPlan[]>({
    queryKey: ["budget-plan", getTripId()],
    queryFn: async () => {
      const r = await fetch(`/api/budget-plan?tripId=${getTripId()}`);
      return r.json();
    },
  });
}

export function useUpdateBudgetPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ category, amount }: { category: string; amount: number }) => {
      const r = await fetch("/api/budget-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, amount, tripId: getTripId() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "update failed");
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget-plan"] }),
  });
}

// === Board (сообщения) ===
export interface BoardMessage {
  id: string;
  content: string;
  userId: string | null;
  user: { id: string; name: string; color: string; emoji: string } | null;
  pinned: boolean;
  createdAt: string;
}

export function useBoard() {
  return useQuery<BoardMessage[]>({
    queryKey: ["board", getTripId()],
    queryFn: async () => {
      const r = await fetch(`/api/board?tripId=${getTripId()}`);
      return r.json();
    },
  });
}

export function useAddBoardMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ content, userId }: { content: string; userId?: string }) => {
      const r = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, userId, tripId: getTripId() }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });
}

export function useTogglePinBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const r = await fetch("/api/board", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pinned }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });
}

export function useDeleteBoardMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/board?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });
}

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

export function useFoods(city?: string) {
  const params = new URLSearchParams();
  params.set("tripId", getTripId()); // ВСЕГДА фильтруем по поездке
  if (city && city !== "all") params.set("city", city);
  return useQuery<FoodItem[]>({
    queryKey: ["foods", getTripId(), city],
    queryFn: async () => {
      const r = await fetch(`/api/foods?${params}`);
      return r.json();
    },
  });
}

export function useUpdateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; tried?: boolean; rating?: number | null }) => {
      const r = await fetch("/api/foods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      return r.json();
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
      if (!r.ok) throw new Error("add food failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["foods"] }),
  });
}

export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/foods?id=${id}`, { method: "DELETE" });
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
      if (!r.ok) throw new Error("upload failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["foods"] }),
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
      const r = await fetch(`/api/ai-summary?tripId=${getTripId()}`, {
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
