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

export function useWeather(city: string) {
  return useQuery<Weather>({
    queryKey: ["weather", city],
    queryFn: async () => {
      const r = await fetch(`/api/weather?city=${city}`);
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
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const r = await fetch("/api/checklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done }),
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
