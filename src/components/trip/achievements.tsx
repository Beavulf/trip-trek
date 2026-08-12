"use client";

import { useTrip, useExpenses, useFoods, useChecklist, useCurrentTripId } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Camera, MapPin, Wallet, BookOpen, UtensilsCrossed, Flame, Plane, Star, Loader2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/currencies";
import { useTripStore } from "@/lib/trip-store";

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: typeof Trophy;
  color: string;
  emoji: string;
  check: (ctx: AchievementContext) => boolean;
  progress?: (ctx: AchievementContext) => { current: number; target: number };
  // P1 #8: adaptive threshold — if trip has fewer items, lower the target
  adaptiveTarget?: (ctx: AchievementContext) => number | null;
}

interface AchievementContext {
  visitedPlaces: number;
  totalPlaces: number;
  totalPhotos: number;
  totalJournals: number;
  totalSpent: number;
  triedFoods: number;
  totalFoods: number;
  currentDay: number;
  totalDays: number;
  checklistDone: number;
  checklistTotal: number;
  currency: string;
  tripStatus: string;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-step",
    title: "Первый шаг",
    description: "Отметить первое место как посещённое",
    icon: MapPin,
    color: "#10b981",
    emoji: "👣",
    check: (c) => c.visitedPlaces >= 1,
    progress: (c) => ({ current: Math.min(c.visitedPlaces, 1), target: 1 }),
  },
  {
    id: "explorer",
    title: "Исследователь",
    description: "Посетить 10 мест",
    icon: MapPin,
    color: "#06b6d4",
    emoji: "🧭",
    check: (c) => c.visitedPlaces >= 10,
    progress: (c) => ({ current: Math.min(c.visitedPlaces, 10), target: 10 }),
  },
  {
    id: "master-explorer",
    title: "Мастер исследователь",
    description: "Посетить 25 мест",
    icon: MapPin,
    color: "#0ea5e9",
    emoji: "🗺️",
    check: (c) => c.visitedPlaces >= 25,
    progress: (c) => ({ current: Math.min(c.visitedPlaces, 25), target: 25 }),
  },
  {
    id: "photographer",
    title: "Фотограф",
    description: "Загрузить 5 фото",
    icon: Camera,
    color: "#8b5cf6",
    emoji: "📸",
    check: (c) => c.totalPhotos >= 5,
    progress: (c) => ({ current: Math.min(c.totalPhotos, 5), target: 5 }),
  },
  {
    id: "photo-pro",
    title: "Профи объектива",
    description: "Загрузить 20 фото",
    icon: Camera,
    color: "#a855f7",
    emoji: "🎬",
    check: (c) => c.totalPhotos >= 20,
    progress: (c) => ({ current: Math.min(c.totalPhotos, 20), target: 20 }),
  },
  {
    id: "diarist",
    title: "Дневникед",
    description: "Сделать 3 записи в дневник",
    icon: BookOpen,
    color: "#ec4899",
    emoji: "📔",
    check: (c) => c.totalJournals >= 3,
    progress: (c) => ({ current: Math.min(c.totalJournals, 3), target: 3 }),
  },
  {
    id: "foodie",
    title: "Гурман",
    description: "Попробовать 5 блюд",
    icon: UtensilsCrossed,
    color: "#f97316",
    emoji: "🍜",
    // P1 #8: adaptive — if trip has <5 foods, target = totalFoods
    check: (c) => c.totalFoods > 0 && c.triedFoods >= Math.min(5, c.totalFoods),
    progress: (c) => ({ current: Math.min(c.triedFoods, Math.min(5, c.totalFoods)), target: Math.min(5, Math.max(1, c.totalFoods)) }),
  },
  {
    id: "food-master",
    title: "Шеф-критик",
    description: "Попробовать 12 блюд",
    icon: UtensilsCrossed,
    color: "#ef4444",
    emoji: "👨‍🍳",
    // P1 #8: adaptive — if trip has <12 foods, target = totalFoods
    check: (c) => c.totalFoods > 0 && c.triedFoods >= Math.min(12, c.totalFoods),
    progress: (c) => ({ current: Math.min(c.triedFoods, Math.min(12, c.totalFoods)), target: Math.min(12, Math.max(1, c.totalFoods)) }),
  },
  {
    id: "ready",
    title: "Готов к поездке",
    description: "Выполнить весь чек-лист",
    icon: Star,
    color: "#f59e0b",
    emoji: "✅",
    // P0 #2: live checklist; if total===0 → not unlock (no /0)
    check: (c) => c.checklistTotal > 0 && c.checklistDone === c.checklistTotal,
    progress: (c) => ({ current: c.checklistDone, target: c.checklistTotal || 1 }),
  },
  {
    id: "halfway",
    title: "Половина пути",
    description: "Середина поездки по календарю",
    icon: Plane,
    color: "#6366f1",
    emoji: "✈️",
    // P1 #4: honest criteria — currentDay from shared formula (calendar-based, but honest copy)
    check: (c) => c.totalDays > 0 && c.currentDay >= Math.ceil(c.totalDays / 2),
    progress: (c) => ({ current: Math.min(c.currentDay, Math.ceil(c.totalDays / 2)), target: Math.ceil(c.totalDays / 2) || 1 }),
  },
  {
    id: "finisher",
    title: "Финишер",
    description: "Последний день поездки по календарю",
    icon: Trophy,
    color: "#eab308",
    emoji: "🏆",
    // P1 #4: honest — last day reached (calendar), not "completed"
    check: (c) => c.totalDays > 0 && c.currentDay >= c.totalDays,
    progress: (c) => ({ current: Math.min(c.currentDay, c.totalDays), target: c.totalDays || 1 }),
  },
  {
    id: "big-spender",
    title: "Шопоголик",
    description: "Потратить 500",
    icon: Wallet,
    color: "#84cc16",
    emoji: "💸",
    // P1 #5: spent excludes settlement; currency-aware description
    check: (c) => c.totalSpent >= 500,
    progress: (c) => ({ current: Math.min(Math.round(c.totalSpent), 500), target: 500 }),
  },
];

export function Achievements() {
  const tripId = useCurrentTripId();
  const { setTripSwitcherOpen } = useTripStore();
  const { data: trip, error: tripError, isLoading: tripLoading, refetch: refetchTrip } = useTrip();
  const { data: expenses, error: expensesError, refetch: refetchExpenses } = useExpenses();
  const { data: foods, isLoading: foodsLoading } = useFoods();
  const { data: checklist, isLoading: checklistLoading } = useChecklist();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">🏆</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Создай или выбери поездку</p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (tripError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <button
          type="button"
          onClick={() => refetchTrip()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }
  if (expensesError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <AlertCircle className="size-8 mx-auto text-red-500" />
        <p className="text-sm font-medium">Не удалось загрузить данные</p>
        <button
          type="button"
          onClick={() => refetchExpenses()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }
  if (tripLoading || !trip || foodsLoading || checklistLoading) {
    return (
      <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Загрузка достижений…
      </div>
    );
  }

  // P0 #1: live foods data (was triedFoods: 0, totalFoods: 16 hardcoded)
  const triedFoods = foods?.filter((f) => f.tried).length ?? 0;
  const totalFoods = foods?.length ?? 0;

  // P0 #2: live checklist data (was checklistDone: 0, checklistTotal: 15 hardcoded)
  const checklistDone = checklist?.filter((i) => i.done).length ?? 0;
  const checklistTotal = checklist?.length ?? 0;

  // P1 #5: spent excludes settlement (was all expenses including settlement)
  const realExpenses = expenses?.filter((e) => e.category !== "settlement") ?? [];
  const totalSpent = realExpenses.reduce((s, e) => s + e.amount, 0);

  const sym = currencySymbol(trip.settings.currency);

  const ctx: AchievementContext = {
    visitedPlaces: trip.visitedPlaces,
    totalPlaces: trip.totalPlaces,
    totalPhotos: trip.totalPhotos,
    totalJournals: trip.totalJournals,
    totalSpent,
    triedFoods,
    totalFoods,
    currentDay: trip.currentDayNumber,
    totalDays: trip.settings.totalDays,
    checklistDone,
    checklistTotal,
    currency: trip.settings.currency,
    tripStatus: trip.trip?.status ?? "planning",
  };

  const unlocked = ACHIEVEMENTS.filter((a) => a.check(ctx));
  const locked = ACHIEVEMENTS.filter((a) => !a.check(ctx));
  const totalScore = unlocked.length;
  const totalPossible = ACHIEVEMENTS.length;

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero — прогресс достижений */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-4 text-[120px] opacity-15 select-none leading-none">🏆</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <Trophy className="size-4" /> Достижения
          </div>
          <h1 className="text-2xl font-bold tabular-nums">{totalScore} / {totalPossible}</h1>
          {/* P1 #6: honest copy — badges are shared for the trip */}
          <p className="text-white/80 text-sm mt-1">
            Бейджи поездки (общие для всех участников)
            {trip.settings.title && <span className="text-white/60"> · {trip.settings.title}</span>}
          </p>
          <div className="mt-3 h-2 rounded-full bg-white/20 overflow-hidden max-w-[240px]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${totalPossible > 0 ? (totalScore / totalPossible) * 100 : 0}%` }}
              transition={{ duration: 0.8 }}
              className="h-full rounded-full bg-white"
            />
          </div>
        </div>
      </div>

      {/* Полученные */}
      {unlocked.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Flame className="size-4 text-amber-500" /> Полученные ({unlocked.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {unlocked.map((a, i) => (
              <AchievementCard
                key={a.id}
                achievement={a}
                unlocked={true}
                index={i}
                ctx={ctx}
                sym={sym}
                expanded={expandedId === a.id}
                onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Заблокированные */}
      {locked.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2 text-muted-foreground">
            <Star className="size-4" /> В процессе ({locked.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {locked.map((a, i) => (
              <AchievementCard
                key={a.id}
                achievement={a}
                unlocked={false}
                index={i}
                ctx={ctx}
                sym={sym}
                expanded={expandedId === a.id}
                onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AchievementCard({ achievement, unlocked, index, ctx, sym, expanded, onToggle }: {
  achievement: Achievement;
  unlocked: boolean;
  index: number;
  ctx: AchievementContext;
  sym: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const progress = achievement.progress?.(ctx);
  const pct = progress && progress.target > 0 ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0;

  // P1 #5: currency-aware description for big-spender
  const desc = achievement.id === "big-spender"
    ? `Потратить ${sym}500`
    : achievement.description;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 25 }}
      className={cn(
        "rounded-2xl border p-3 text-center relative overflow-hidden transition-colors",
        unlocked
          ? "bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/40"
          : "bg-card border-border opacity-70"
      )}
    >
      {unlocked && (
        <div
          className="absolute -top-2 -right-2 size-12 rounded-full opacity-20 blur-xl"
          style={{ background: achievement.color }}
        />
      )}
      <div className="relative">
        {/* P2 #12: card as button for a11y; P2 #9: tap-expand */}
        <button
          onClick={onToggle}
          aria-label={`${achievement.title}: ${desc}`}
          aria-expanded={expanded}
          className="w-full"
        >
          {/* Иконка/эмодзи */}
          <div
            className={cn(
              "size-12 mx-auto rounded-xl grid place-items-center text-2xl mb-2 transition-transform",
              unlocked ? "scale-100" : "grayscale opacity-50"
            )}
            style={{ background: `${achievement.color}22` }}
          >
            {achievement.emoji}
          </div>
          {/* Название */}
          <div className="font-semibold text-xs leading-tight mb-0.5">{achievement.title}</div>
          {/* Описание — P2 #9: expand on tap (like Profile) */}
          <div className={cn(
            "text-[10px] text-muted-foreground leading-tight mb-2",
            expanded ? "" : "line-clamp-2"
          )}>
            {desc}
          </div>
        </button>
        {/* Прогресс (если не получено) */}
        {!unlocked && progress && (
          <div>
            <div className="h-1 rounded-full bg-muted overflow-hidden mb-1" role="progressbar" aria-valuenow={progress.current} aria-valuemin={0} aria-valuemax={progress.target}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: index * 0.05 }}
                className="h-full rounded-full"
                style={{ background: achievement.color }}
              />
            </div>
            <div className="text-[9px] text-muted-foreground tabular-nums">
              {progress.current} / {progress.target}
            </div>
          </div>
        )}
        {unlocked && (
          <div className="text-[9px] font-medium" style={{ color: achievement.color }}>
            ✓ Получено
          </div>
        )}
      </div>
    </motion.div>
  );
}
