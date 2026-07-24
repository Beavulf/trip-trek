"use client";

import { useTrip, useExpenses } from "@/hooks/use-trip";
import { motion } from "framer-motion";
import { Trophy, Camera, MapPin, Wallet, BookOpen, UtensilsCrossed, Flame, Plane, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: typeof Trophy;
  color: string;
  emoji: string;
  check: (ctx: AchievementContext) => boolean;
  progress?: (ctx: AchievementContext) => { current: number; target: number };
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
    check: (c) => c.triedFoods >= 5,
    progress: (c) => ({ current: Math.min(c.triedFoods, 5), target: 5 }),
  },
  {
    id: "food-master",
    title: "Шеф-критик",
    description: "Попробовать 12 блюд",
    icon: UtensilsCrossed,
    color: "#ef4444",
    emoji: "👨‍🍳",
    check: (c) => c.triedFoods >= 12,
    progress: (c) => ({ current: Math.min(c.triedFoods, 12), target: 12 }),
  },
  {
    id: "ready",
    title: "Готов к поездке",
    description: "Выполнить весь чек-лист",
    icon: Star,
    color: "#f59e0b",
    emoji: "✅",
    check: (c) => c.checklistTotal > 0 && c.checklistDone === c.checklistTotal,
    progress: (c) => ({ current: c.checklistDone, target: c.checklistTotal }),
  },
  {
    id: "halfway",
    title: "Половина пути",
    description: "Пройти половину дней поездки",
    icon: Plane,
    color: "#6366f1",
    emoji: "✈️",
    check: (c) => c.currentDay >= Math.ceil(c.totalDays / 2),
    progress: (c) => ({ current: c.currentDay, target: Math.ceil(c.totalDays / 2) }),
  },
  {
    id: "finisher",
    title: "Финишер",
    description: "Завершить все дни поездки",
    icon: Trophy,
    color: "#eab308",
    emoji: "🏆",
    check: (c) => c.currentDay >= c.totalDays,
    progress: (c) => ({ current: c.currentDay, target: c.totalDays }),
  },
  {
    id: "big-spender",
    title: "Шопоголик",
    description: "Потратить $500",
    icon: Wallet,
    color: "#84cc16",
    emoji: "💸",
    check: (c) => c.totalSpent >= 500,
    progress: (c) => ({ current: Math.min(Math.round(c.totalSpent), 500), target: 500 }),
  },
];

export function Achievements() {
  const { data: trip } = useTrip();
  const { data: expenses } = useExpenses();

  if (!trip) return null;

  // Для упрощения triedFoods/checklist — заглушки (можно расширить)
  const ctx: AchievementContext = {
    visitedPlaces: trip.visitedPlaces,
    totalPlaces: trip.totalPlaces,
    totalPhotos: trip.totalPhotos,
    totalJournals: trip.totalJournals,
    totalSpent: expenses?.reduce((s, e) => s + e.amount, 0) ?? 0,
    triedFoods: 0, // TODO: подключить useFoods если нужно
    totalFoods: 16,
    currentDay: trip.currentDayNumber,
    totalDays: trip.settings.totalDays,
    checklistDone: 0,
    checklistTotal: 15,
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
          <h1 className="text-2xl font-bold">{totalScore} / {totalPossible}</h1>
          <p className="text-white/80 text-sm mt-1">Получено бейджей</p>
          <div className="mt-3 h-2 rounded-full bg-white/20 overflow-hidden max-w-[240px]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(totalScore / totalPossible) * 100}%` }}
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
              <AchievementCard key={a.id} achievement={a} unlocked={true} index={i} ctx={ctx} />
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
              <AchievementCard key={a.id} achievement={a} unlocked={false} index={i} ctx={ctx} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AchievementCard({ achievement, unlocked, index, ctx }: {
  achievement: Achievement;
  unlocked: boolean;
  index: number;
  ctx: AchievementContext;
}) {
  const Icon = achievement.icon;
  const progress = achievement.progress?.(ctx);
  const pct = progress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 25 }}
      whileHover={{ scale: 1.03 }}
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
        {/* Описание */}
        <div className="text-[10px] text-muted-foreground leading-tight mb-2 line-clamp-2">
          {achievement.description}
        </div>
        {/* Прогресс (если не получено) */}
        {!unlocked && progress && (
          <div>
            <div className="h-1 rounded-full bg-muted overflow-hidden mb-1">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: index * 0.05 }}
                className="h-full rounded-full"
                style={{ background: achievement.color }}
              />
            </div>
            <div className="text-[9px] text-muted-foreground">
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
