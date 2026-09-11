"use client";

import { motion } from "framer-motion";
import { Camera, Coffee, MapPin, TrendingDown, Wallet } from "lucide-react";
import { type TripSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/currencies";
import { useTripStore } from "@/lib/trip-store";

interface DashboardStatsProps {
  trip: TripSummary;
  /** Сколько дней осталось (0 — не показываем темп трат) */
  daysRemaining: number;
}

/**
 * Статы Обзора: бюджет — крупно и тапабельно, рядом три счётчика.
 * Погода и обратный отсчёт живут в hero, чтобы каждая цифра встречалась один раз.
 */
export function DashboardStats({ trip, daysRemaining }: DashboardStatsProps) {
  const { setActiveTab, setRestView } = useTripStore();
  const sym = currencySymbol(trip.settings.currency);
  const budget = trip.settings.totalBudget;
  const hasBudget = budget > 0;
  const budgetPct = hasBudget ? Math.min(100, (trip.totalSpent / budget) * 100) : 0;
  const showPace = hasBudget && daysRemaining >= 1 && trip.remainingBudget > 0;

  return (
    <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
      <button
        type="button"
        onClick={() => setActiveTab("budget")}
        className="col-span-3 lg:col-span-2 rounded-2xl bg-card border border-border p-4 text-left hover:shadow-lg card-hover group"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="size-4" /> Бюджет
          </div>
          <TrendingDown className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold leading-none tabular-nums">{sym}{trip.totalSpent.toFixed(0)}</span>
          {hasBudget && <span className="text-sm text-muted-foreground mb-0.5">/ {sym}{budget}</span>}
        </div>
        {hasBudget ? (
          <>
            <div className="mt-2.5 h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${budgetPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500"
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
              <span className={cn(trip.remainingBudget < 0 && "text-red-500 font-medium")}>
                {trip.remainingBudget >= 0
                  ? `Остаток ${sym}${trip.remainingBudget.toFixed(0)}`
                  : `Перерасход ${sym}${Math.abs(trip.remainingBudget).toFixed(0)}`}
              </span>
              {showPace && (
                <span>≈ {sym}{Math.ceil(trip.remainingBudget / daysRemaining)} в день</span>
              )}
            </div>
          </>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">Бюджет не задан — задать →</div>
        )}
      </button>

      <StatCard
        icon={<MapPin className="size-5" />}
        value={trip.visitedPlaces}
        label={`из ${trip.totalPlaces} мест`}
        color="#f97316"
        onClick={() => setActiveTab("itinerary")}
      />
      <StatCard
        icon={<Camera className="size-5" />}
        value={trip.totalPhotos}
        label="Фото"
        color="#06b6d4"
        onClick={() => setActiveTab("gallery")}
      />
      {/* Быстрый поиск кафе/баров рядом — сразу открывает вкладку Chill → «Рядом» */}
      <StatCard
        icon={<Coffee className="size-5" />}
        value="Рядом"
        label="кафе и бары"
        color="#ef4444"
        onClick={() => {
          setRestView("nearby");
          setActiveTab("rest");
        }}
      />
    </div>
  );
}

function StatCard({ icon, value, label, color, onClick }: { icon: React.ReactNode; value: React.ReactNode; label: string; color: string; onClick?: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className="rounded-2xl bg-card border border-border p-4 text-left card-hover hover:border-primary/30 relative overflow-hidden"
    >
      <div
        className="absolute -top-4 -right-4 size-14 rounded-full opacity-10 blur-xl"
        style={{ background: color }}
      />
      <div className="relative">
        <div className="size-9 rounded-xl grid place-items-center mb-2" style={{ background: `${color}22`, color }}>
          {icon}
        </div>
        <div className="text-2xl font-bold leading-none tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </div>
    </motion.button>
  );
}
