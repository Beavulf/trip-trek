"use client";

import { create } from "zustand";

// Запрос «открой этот тур сейчас» из любого места приложения (кнопка «?», Центр обучения).
// Транзиентное, не в persist: TourHost забирает запрос и сбрасывает его.
interface TourRequestState {
  requested: { id: string; nonce: number } | null;
  /** Центр обучения (шит) — открывается из «?» без подсказки раздела и из Профиля */
  centerOpen: boolean;
  openTour: (id: string) => void;
  clear: () => void;
  setCenterOpen: (v: boolean) => void;
}

export const useTourStore = create<TourRequestState>((set) => ({
  requested: null,
  centerOpen: false,
  openTour: (id) => set({ requested: { id, nonce: Date.now() } }),
  clear: () => set({ requested: null }),
  setCenterOpen: (v) => set({ centerOpen: v }),
}));
