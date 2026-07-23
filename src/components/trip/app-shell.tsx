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
  Plus,
  Moon,
  Sun,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { QuickAddSheet } from "./quick-add";

const TABS = [
  { key: "dashboard", label: "Обзор", icon: LayoutDashboard },
  { key: "itinerary", label: "Маршрут", icon: ListChecks },
  { key: "map", label: "Карта", icon: MapIcon },
  { key: "gallery", label: "Галерея", icon: Images },
  { key: "budget", label: "Бюджет", icon: Wallet },
  { key: "rest", label: "Chill", icon: Coffee },
  { key: "journal", label: "Дневник", icon: BookOpen },
  { key: "ai", label: "AI-Итоги", icon: Sparkles },
  { key: "info", label: "Инфо", icon: Info },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [quickOpen, setQuickOpen] = useState(false);
  const { activeTab, setActiveTab } = useTripStore();
  const { data: trip } = useTrip();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-8 rounded-xl bg-gradient-to-br from-orange-500 via-rose-500 to-violet-500 grid place-items-center text-white font-bold text-sm shadow-lg shrink-0">
              T
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm leading-tight truncate">
                TripTrek <span className="text-muted-foreground font-normal">China</span>
              </div>
              <div className="text-[10px] text-muted-foreground leading-tight">
                {trip ? `День ${trip.currentDayNumber} из ${trip.settings.totalDays} · ${trip.days.find(d => d.dayNumber === trip.currentDayNumber)?.city ?? ""}` : "загрузка…"}
              </div>
            </div>
          </div>

          <div className="flex-1" />

          <ThemeToggle />
          <ParticipantAvatars />
        </div>

        {/* Tab bar */}
        <nav className="mx-auto max-w-7xl px-2 sm:px-4 pb-1.5">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="tab-bg"
                      className="absolute inset-0 rounded-lg bg-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon className="size-4 relative z-10" />
                  <span className="relative z-10">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Main */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-4 py-4 pb-28 sm:pb-10 relative z-0">
        {children}
      </main>

      {/* FAB — большой, удобно для пальца на мобиле */}
      <button
        onClick={() => setQuickOpen(true)}
        className="fixed bottom-5 right-4 sm:right-6 z-40 size-16 sm:size-14 rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-2xl shadow-orange-500/40 grid place-items-center active:scale-90 hover:scale-105 transition-transform border-2 border-white/20"
        aria-label="Быстрое добавление"
      >
        <Plus className="size-8 sm:size-7" strokeWidth={2.5} />
      </button>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 py-3 text-center text-xs text-muted-foreground">
          TripTrek · China 2024 · Гуанчжоу → Шэньчжэнь → Гонконг → Макао · 12 дней в пути 🌏
        </div>
      </footer>

      <QuickAddSheet open={quickOpen} onOpenChange={setQuickOpen} />
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
