"use client";

import { useTrip } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  Images,
  Wallet,
  Coffee,
  BookOpen,
  Info,
  Sparkles,
  Languages,
  CloudSun,
  Train,
  UtensilsCrossed,
  Trophy,
  MessagesSquare,
  Plus,
  Moon,
  Sun,
  Search,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { QuickAddSheet } from "./quick-add";
import { GlobalSearch } from "./global-search";

const TABS = [
  { key: "dashboard", label: "Обзор", icon: LayoutDashboard },
  { key: "itinerary", label: "Маршрут", icon: ListChecks },
  { key: "map", label: "Карта", icon: MapIcon },
  { key: "gallery", label: "Галерея", icon: Images },
  { key: "budget", label: "Бюджет", icon: Wallet },
  { key: "rest", label: "Chill", icon: Coffee },
  { key: "journal", label: "Дневник", icon: BookOpen },
  { key: "ai", label: "AI", icon: Sparkles },
  { key: "food", label: "Еда", icon: UtensilsCrossed },
  { key: "phrases", label: "Фразы", icon: Languages },
  { key: "weather", label: "Погода", icon: CloudSun },
  { key: "transport", label: "Транспорт", icon: Train },
  { key: "board", label: "Чат", icon: MessagesSquare },
  { key: "achievements", label: "Награды", icon: Trophy },
  { key: "info", label: "Инфо", icon: Info },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { activeTab, setActiveTab } = useTripStore();
  const { data: trip } = useTrip();

  // Горячая клавиша: Cmd/Ctrl + K — открыть поиск
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      {/* Декоративный фоновый градиент */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(circle at 20% 0%, var(--primary) 0%, transparent 50%), radial-gradient(circle at 80% 100%, #8b5cf6 0%, transparent 50%)",
      }} />
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b border-border/80">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="size-8 rounded-xl bg-gradient-to-br from-orange-500 via-rose-500 to-violet-500 grid place-items-center text-white font-bold text-sm shadow-lg shadow-orange-500/20 shrink-0"
            >
              T
            </motion.div>
            <div className="min-w-0 hidden xs:block">
              <div className="font-bold text-sm leading-tight truncate">
                TripTrek <span className="text-muted-foreground font-normal">China</span>
              </div>
              <div className="text-[10px] text-muted-foreground leading-tight">
                {trip ? `День ${trip.currentDayNumber} из ${trip.settings.totalDays} · ${trip.days.find(d => d.dayNumber === trip.currentDayNumber)?.city ?? ""}` : "загрузка…"}
              </div>
            </div>
          </div>

          <div className="flex-1" />

          {/* Кнопка поиска */}
          <button
            onClick={() => setSearchOpen(true)}
            className="size-8 rounded-full grid place-items-center bg-secondary border border-border hover:bg-accent transition-colors"
            title="Поиск (Ctrl+K)"
            aria-label="Поиск"
          >
            <Search className="size-4" />
          </button>

          <ThemeToggle />
          <ParticipantAvatars />
        </div>

        {/* Tab bar */}
        <nav className="mx-auto max-w-7xl px-2 sm:px-4 pb-1.5 relative">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.key;
              const badge = getTabBadge(t.key, trip);
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all duration-200 active:scale-95",
                    active
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="tab-bg"
                      className="absolute inset-0 rounded-xl bg-primary shadow-md shadow-primary/30"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon className={cn("size-4 relative z-10 transition-transform", active && "scale-110")} />
                  <span className="relative z-10">{t.label}</span>
                  {badge !== null && (
                    <span className={cn(
                      "relative z-10 ml-0.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold grid place-items-center transition-colors",
                      active ? "bg-white/25 text-white" : "bg-primary/15 text-primary"
                    )}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Fade-индикаторы: показывают что есть ещё кнопки */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-1.5 w-8 bg-gradient-to-l from-background to-transparent sm:hidden" />
          <div className="pointer-events-none absolute left-0 top-0 bottom-1.5 w-8 bg-gradient-to-r from-background to-transparent sm:hidden opacity-0" id="tab-fade-left" />
        </nav>
      </header>

      {/* Main */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-4 py-4 pb-28 sm:pb-10 relative z-0">
        {children}
      </main>

      {/* FAB — большой, удобно для пальца на мобиле */}
      <motion.button
        onClick={() => setQuickOpen(true)}
        whileTap={{ scale: 0.88 }}
        whileHover={{ scale: 1.06 }}
        className="fixed bottom-5 right-4 sm:right-6 z-40 size-16 sm:size-14 rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-2xl shadow-orange-500/40 grid place-items-center transition-transform border-2 border-white/20"
        aria-label="Быстрое добавление"
      >
        {/* Pulsing ring */}
        <motion.div
          className="absolute inset-0 rounded-full bg-orange-500"
          animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
        <Plus className="size-8 sm:size-7 relative z-10" strokeWidth={2.5} />
      </motion.button>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-card/30">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium">TripTrek</span>
          <span className="opacity-40">·</span>
          <span>China 2024</span>
          <span className="opacity-40">·</span>
          <span className="hidden sm:inline">Гуанчжоу → Шэньчжэнь → Гонконг → Макао</span>
          <span className="sm:hidden">12 дней 🌏</span>
        </div>
      </footer>

      <QuickAddSheet open={quickOpen} onOpenChange={setQuickOpen} />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function ParticipantAvatars() {
  const { data: trip } = useTrip();
  const { setCurrentUserId } = useTripStore();
  if (!trip) return null;
  const current = trip.participants.find((p) => p.id === trip.settings.currentUserId) || trip.participants[0];

  return (
    <div className="flex items-center -space-x-2">
      {trip.participants.map((p) => {
        const isCurrent = p.id === current?.id;
        return (
          <button
            key={p.id}
            onClick={() => setCurrentUserId(p.id)}
            title={`${p.name}${p.role ? " · " + p.role : ""}`}
            className={cn(
              "size-8 rounded-full grid place-items-center text-sm border-2 transition-transform hover:scale-110 hover:z-10",
              isCurrent ? "border-background ring-2 ring-primary scale-110 z-10" : "border-background opacity-70"
            )}
            style={{ background: p.color }}
          >
            <span>{p.emoji}</span>
          </button>
        );
      })}
    </div>
  );
}

function ThemeToggle() {
  const { setTheme } = useTheme();
  const toggle = () => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "light" : "dark");
  };
  return (
    <button
      onClick={toggle}
      title="Сменить тему"
      className="size-8 rounded-full grid place-items-center bg-secondary border border-border hover:bg-accent transition-colors"
    >
      <Sun className="size-4 hidden dark:block" />
      <Moon className="size-4 block dark:hidden" />
    </button>
  );
}

// Бейджи уведомлений для табов
function getTabBadge(key: string, trip: ReturnType<typeof useTrip>["data"]): number | null {
  if (!trip) return null;
  switch (key) {
    case "itinerary": {
      const unvisited = trip.totalPlaces - trip.visitedPlaces;
      return unvisited > 0 ? unvisited : null;
    }
    case "gallery":
      return trip.totalPhotos > 0 ? trip.totalPhotos : null;
    case "journal":
      return trip.totalJournals > 0 ? trip.totalJournals : null;
    default:
      return null;
  }
}
