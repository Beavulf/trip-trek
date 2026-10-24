import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Режимы шита быстрого добавления (FAB) */
export type QuickAddMode = "photo" | "expense" | "journal";

export type TripTab =
  | "dashboard"
  | "timeline"
  | "itinerary"
  | "lodging"
  | "map"
  | "gallery"
  | "budget"
  | "rest"
  | "journal"
  | "ai"
  | "food"
  | "phrases"
  | "weather"
  | "transport"
  | "board"
  | "achievements"
  | "info";

interface TripState {
  activeTab: TripTab;
  // Карта хоть раз открывалась в этой сессии: после этого page.tsx держит её
  // смонтированной (прячет display:none при уходе), чтобы возврат на вкладку был
  // мгновенным. Транзиентное (не в persist): после перезагрузки страницы карта
  // честно строится заново при первом заходе.
  mapEverOpened: boolean;
  setActiveTab: (t: TripTab) => void;
  // Шит быстрого добавления (FAB) и менеджер фоновой загрузки фото. Живут в сторе, а не в
  // состоянии оболочки: открыть их надо из тостов и плашки загрузки (транзиентное, не в persist)
  quickAddOpen: boolean;
  /** Режим, в котором просили открыть шит (тост «Вернуть» → сразу форма траты); null — по умолчанию «Фото» */
  quickAddMode: QuickAddMode | null;
  setQuickAddOpen: (v: boolean) => void;
  openQuickAdd: (mode?: QuickAddMode) => void;
  uploadManagerOpen: boolean;
  setUploadManagerOpen: (v: boolean) => void;
  // Окно «Обратная связь»: его открывают меню, профиль и ссылка из уведомления об ответе
  // (транзиентное, не в persist). feedbackId — сразу открыть переписку этого обращения
  feedbackOpen: boolean;
  feedbackId: string | null;
  openFeedback: (id?: string | null) => void;
  setFeedbackOpen: (v: boolean) => void;
  currentUserId: string | null;
  setCurrentUserId: (id: string | null) => void;
  selectedDay: number | null;
  setSelectedDay: (d: number | null) => void;
  currentTripId: string;
  setCurrentTripId: (id: string) => void;
  // id только что созданной поездки: пока список поездок не подтянулся,
  // эффекты автовыбора не должны перебивать её на первую попавшуюся
  pendingTripId: string | null;
  setPendingTripId: (id: string | null) => void;
  tripSwitcherOpen: boolean;
  setTripSwitcherOpen: (v: boolean) => void;
  mapCityFilter: string | null;
  setMapCityFilter: (c: string | null) => void;
  mapOnlyUnvisited: boolean;
  setMapOnlyUnvisited: (v: boolean) => void;
  mapOnlyChill: boolean;
  setMapOnlyChill: (v: boolean) => void;
  // Под view вкладки Chill («route»/«wishlist»/«nearby»): Обзор открывает «Рядом»
  // одной кнопкой. Транзиентное — сбрасывается после consumption в RestChill.
  restView: "route" | "wishlist" | "nearby" | null;
  setRestView: (v: "route" | "wishlist" | "nearby" | null) => void;
}

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      activeTab: "dashboard",
      mapEverOpened: false,
      quickAddOpen: false,
      quickAddMode: null,
      setQuickAddOpen: (v) =>
        set((st) => {
          if (st.quickAddOpen === v) return st;
          // закрытие сбрасывает запрошенный режим: следующее открытие снова начинается с «Фото»
          return v ? { quickAddOpen: true } : { quickAddOpen: false, quickAddMode: null };
        }),
      openQuickAdd: (mode) => set({ quickAddOpen: true, quickAddMode: mode ?? null }),
      uploadManagerOpen: false,
      setUploadManagerOpen: (v) => set((st) => (st.uploadManagerOpen === v ? st : { uploadManagerOpen: v })),
      feedbackOpen: false,
      feedbackId: null,
      openFeedback: (id) => set({ feedbackOpen: true, feedbackId: id ?? null }),
      setFeedbackOpen: (v) => set((st) => (st.feedbackOpen === v ? st : { feedbackOpen: v, feedbackId: v ? st.feedbackId : null })),
      setActiveTab: (t) =>
        set((s) => ({ activeTab: t, mapEverOpened: s.mapEverOpened || t === "map" })),
      currentUserId: null,
      setCurrentUserId: (id) => set({ currentUserId: id }),
      selectedDay: null,
      setSelectedDay: (d) => set({ selectedDay: d }),
      currentTripId: "",
      setCurrentTripId: (id) =>
        set({
          currentTripId: id,
          mapCityFilter: null,
          mapOnlyUnvisited: false,
          mapOnlyChill: false,
          selectedDay: null,
        }),
      pendingTripId: null,
      setPendingTripId: (id) => set({ pendingTripId: id }),
      tripSwitcherOpen: false,
      setTripSwitcherOpen: (v) => set({ tripSwitcherOpen: v }),
      mapCityFilter: null,
      setMapCityFilter: (c) => set({ mapCityFilter: c }),
      mapOnlyUnvisited: false,
      setMapOnlyUnvisited: (v) => set({ mapOnlyUnvisited: v }),
      mapOnlyChill: false,
      setMapOnlyChill: (v) => set({ mapOnlyChill: v }),
      restView: null,
      setRestView: (v) => set({ restView: v }),
    }),
    {
      name: "triptrek-store",
      partialize: (s) => ({
        activeTab: s.activeTab,
        currentUserId: s.currentUserId,
        selectedDay: s.selectedDay,
        currentTripId: s.currentTripId,
        mapCityFilter: s.mapCityFilter,
        mapOnlyUnvisited: s.mapOnlyUnvisited,
        mapOnlyChill: s.mapOnlyChill,
      }),
    }
  )
);
