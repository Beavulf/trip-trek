import { Trophy, Camera, MapPin, Wallet, BookOpen, UtensilsCrossed, Plane, Star } from "lucide-react";
import type { TripTab } from "@/lib/trip-store";
import type { LucideIcon } from "lucide-react";

/**
 * Единый источник бейджей поездки («Награды»).
 * Бейджи общие для всей компании — считаются по данным поездки на клиенте.
 */

export interface AchievementContext {
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

interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  emoji: string;
  check: (ctx: AchievementContext) => boolean;
  progress?: (ctx: AchievementContext) => { current: number; target: number };
  /** Слово для прожектора: «Ещё 2 фото — и награда ваша» */
  unit?: [string, string, string];
  /** Куда вести пользователя, чтобы бейдж приблизился */
  cta: { tab: TripTab; label: string };
}

export interface Badge extends AchievementDef {
  unlocked: boolean;
  current: number;
  target: number;
  pct: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-step",
    title: "Первый шаг",
    description: "Отметить первое место как посещённое",
    icon: MapPin,
    color: "#10b981",
    emoji: "👣",
    unit: ["место", "места", "мест"],
    check: (c) => c.visitedPlaces >= 1,
    progress: (c) => ({ current: Math.min(c.visitedPlaces, 1), target: 1 }),
    cta: { tab: "itinerary", label: "Открыть маршрут" },
  },
  {
    id: "explorer",
    title: "Исследователь",
    description: "Посетить 10 мест",
    icon: MapPin,
    color: "#06b6d4",
    emoji: "🧭",
    unit: ["место", "места", "мест"],
    check: (c) => c.visitedPlaces >= 10,
    progress: (c) => ({ current: Math.min(c.visitedPlaces, 10), target: 10 }),
    cta: { tab: "itinerary", label: "Открыть маршрут" },
  },
  {
    id: "master-explorer",
    title: "Мастер исследователь",
    description: "Посетить 25 мест",
    icon: MapPin,
    color: "#0ea5e9",
    emoji: "🗺️",
    unit: ["место", "места", "мест"],
    check: (c) => c.visitedPlaces >= 25,
    progress: (c) => ({ current: Math.min(c.visitedPlaces, 25), target: 25 }),
    cta: { tab: "itinerary", label: "Открыть маршрут" },
  },
  {
    id: "photographer",
    title: "Фотограф",
    description: "Загрузить 5 фото",
    icon: Camera,
    color: "#8b5cf6",
    emoji: "📸",
    unit: ["фото", "фото", "фото"],
    check: (c) => c.totalPhotos >= 5,
    progress: (c) => ({ current: Math.min(c.totalPhotos, 5), target: 5 }),
    cta: { tab: "gallery", label: "Открыть галерею" },
  },
  {
    id: "photo-pro",
    title: "Профи объектива",
    description: "Загрузить 20 фото",
    icon: Camera,
    color: "#a855f7",
    emoji: "🎬",
    unit: ["фото", "фото", "фото"],
    check: (c) => c.totalPhotos >= 20,
    progress: (c) => ({ current: Math.min(c.totalPhotos, 20), target: 20 }),
    cta: { tab: "gallery", label: "Открыть галерею" },
  },
  {
    id: "diarist",
    title: "Дневникед",
    description: "Сделать 3 записи в дневник",
    icon: BookOpen,
    color: "#ec4899",
    emoji: "📔",
    unit: ["запись", "записи", "записей"],
    check: (c) => c.totalJournals >= 3,
    progress: (c) => ({ current: Math.min(c.totalJournals, 3), target: 3 }),
    cta: { tab: "journal", label: "Открыть дневник" },
  },
  {
    id: "foodie",
    title: "Гурман",
    description: "Попробовать 5 блюд",
    icon: UtensilsCrossed,
    color: "#f97316",
    emoji: "🍜",
    unit: ["блюдо", "блюда", "блюд"],
    // Адаптивная цель: если в поездке меньше 5 блюд — цель = всё меню
    check: (c) => c.totalFoods > 0 && c.triedFoods >= Math.min(5, c.totalFoods),
    progress: (c) => ({ current: Math.min(c.triedFoods, Math.min(5, c.totalFoods)), target: Math.min(5, Math.max(1, c.totalFoods)) }),
    cta: { tab: "food", label: "Открыть меню" },
  },
  {
    id: "food-master",
    title: "Шеф-критик",
    description: "Попробовать 12 блюд",
    icon: UtensilsCrossed,
    color: "#ef4444",
    emoji: "👨‍🍳",
    unit: ["блюдо", "блюда", "блюд"],
    // Адаптивная цель: если в поездке меньше 12 блюд — цель = всё меню
    check: (c) => c.totalFoods > 0 && c.triedFoods >= Math.min(12, c.totalFoods),
    progress: (c) => ({ current: Math.min(c.triedFoods, Math.min(12, c.totalFoods)), target: Math.min(12, Math.max(1, c.totalFoods)) }),
    cta: { tab: "food", label: "Открыть меню" },
  },
  {
    id: "ready",
    title: "Готов к поездке",
    description: "Выполнить весь чек-лист",
    icon: Star,
    color: "#f59e0b",
    emoji: "✅",
    unit: ["пункт", "пункта", "пунктов"],
    check: (c) => c.checklistTotal > 0 && c.checklistDone === c.checklistTotal,
    progress: (c) => ({ current: c.checklistDone, target: c.checklistTotal || 1 }),
    cta: { tab: "info", label: "Открыть чек-лист" },
  },
  {
    id: "halfway",
    title: "Половина пути",
    description: "Середина поездки по календарю",
    icon: Plane,
    color: "#6366f1",
    emoji: "✈️",
    unit: ["день", "дня", "дней"],
    // Календарные бейджи честны: до старта поездки (planning) ещё не получены,
    // даже если формула currentDayNumber клампнет день в 1
    check: (c) => c.tripStatus !== "planning" && c.totalDays > 0 && c.currentDay >= Math.ceil(c.totalDays / 2),
    progress: (c) => ({ current: Math.min(c.currentDay, Math.ceil(c.totalDays / 2)), target: Math.ceil(c.totalDays / 2) || 1 }),
    cta: { tab: "dashboard", label: "К плану дня" },
  },
  {
    id: "finisher",
    title: "Финишер",
    description: "Последний день поездки по календарю",
    icon: Trophy,
    color: "#eab308",
    emoji: "🏆",
    unit: ["день", "дня", "дней"],
    check: (c) => c.tripStatus !== "planning" && c.totalDays > 0 && c.currentDay >= c.totalDays,
    progress: (c) => ({ current: Math.min(c.currentDay, c.totalDays), target: c.totalDays || 1 }),
    cta: { tab: "dashboard", label: "К плану дня" },
  },
  {
    id: "big-spender",
    title: "Шопоголик",
    description: "Потратить 500",
    icon: Wallet,
    color: "#84cc16",
    emoji: "💸",
    check: (c) => c.totalSpent >= 500,
    progress: (c) => ({ current: Math.min(Math.round(c.totalSpent), 500), target: 500 }),
    cta: { tab: "budget", label: "Открыть бюджет" },
  },
];

/** Считает все бейджи по контексту поездки */
export function computeBadges(ctx: AchievementContext): Badge[] {
  return ACHIEVEMENTS.map((a) => {
    const progress = a.progress?.(ctx);
    const target = progress?.target ?? 0;
    const current = progress?.current ?? 0;
    return {
      ...a,
      unlocked: a.check(ctx),
      current,
      target,
      pct: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
    };
  });
}

/** Описание с валютой для денежных бейджей */
export function describeBadge(a: AchievementDef, sym: string): string {
  return a.id === "big-spender" ? `Потратить ${sym}500` : a.description;
}

/** Прожектор: ближайший незакрытый бейдж (по % прогресса, при равенстве — с меньшим остатком) */
export function closestBadge(badges: Badge[]): Badge | null {
  const locked = badges.filter((b) => !b.unlocked);
  if (locked.length === 0) return null;
  return [...locked].sort(
    (a, b) => b.pct - a.pct || (b.target - b.current) - (a.target - a.current)
  )[0];
}

const RANKS: { min: number; emoji: string; title: string }[] = [
  { min: 100, emoji: "👑", title: "Легенды поездки" },
  { min: 70, emoji: "🗺️", title: "Мастера маршрута" },
  { min: 40, emoji: "🧭", title: "Путешественники" },
  { min: 1, emoji: "🎒", title: "Туристы" },
  { min: 0, emoji: "🐣", title: "Только начали" },
];

/** Звание компании по доле собранных бейджей */
export function rankFor(score: number, total: number): { emoji: string; title: string } {
  const pct = total > 0 ? (score / total) * 100 : 0;
  return RANKS.find((r) => pct >= r.min) ?? RANKS[RANKS.length - 1];
}

/** Полученные / незакрытые бейджи */
export function splitBadges(badges: Badge[]) {
  const unlocked = badges.filter((b) => b.unlocked);
  const locked = badges.filter((b) => !b.unlocked);
  return { unlocked, locked };
}
