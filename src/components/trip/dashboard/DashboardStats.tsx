"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Camera,
  Clock,
  Droplets,
  MapPin,
  Plane,
  Route,
  Settings2,
  Sun,
  TrendingDown,
  Wallet,
  Wind,
} from "lucide-react";
import { useWeather } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { type TripSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DatesEditor } from "./DatesEditor";

interface DashboardStatsProps {
  trip: TripSummary;
  isBefore: boolean;
  isAfter: boolean;
  daysRemaining: number;
  currentCityKey: string;
}

export function DashboardStats({
  trip,
  isBefore,
  isAfter,
  daysRemaining,
  currentCityKey,
}: DashboardStatsProps) {
  const { setActiveTab } = useTripStore();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <CountdownCard
        isBefore={isBefore}
        isAfter={isAfter}
        daysRemaining={daysRemaining}
        currentDay={trip.currentDayNumber}
        totalDays={trip.settings.totalDays}
        startDate={trip.settings.startDate}
        endDate={trip.settings.endDate}
      />

      {/* Бюджет */}
      <button
        onClick={() => setActiveTab("budget")}
        className="col-span-2 lg:col-span-1 rounded-2xl bg-card border border-border p-4 text-left hover:shadow-lg transition-shadow group"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="size-4" /> Бюджет
          </div>
          <TrendingDown className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
        </div>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold">${trip.totalSpent.toFixed(0)}</span>
          <span className="text-sm text-muted-foreground mb-1">/ ${trip.settings.totalBudget}</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500"
            style={{ width: `${Math.min(100, (trip.totalSpent / trip.settings.totalBudget) * 100)}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground mt-1.5">
          Остаток: ${trip.remainingBudget.toFixed(0)}
        </div>
      </button>

      <WeatherWidget cityKey={currentCityKey} />

      <StatCard
        icon={<Camera className="size-5" />}
        value={trip.totalPhotos}
        label="Фото"
        color="#06b6d4"
        onClick={() => setActiveTab("gallery")}
      />
      <StatCard
        icon={<MapPin className="size-5" />}
        value={trip.visitedPlaces}
        label={`из ${trip.totalPlaces} мест`}
        color="#f97316"
        onClick={() => setActiveTab("itinerary")}
      />
      <StatCard
        icon={<BookOpen className="size-5" />}
        value={trip.totalJournals}
        label="Записей"
        color="#8b5cf6"
        onClick={() => setActiveTab("journal")}
      />
    </div>
  );
}

function StatCard({ icon, value, label, color, onClick }: { icon: React.ReactNode; value: number; label: string; color: string; onClick?: () => void }) {
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

function WeatherWidget({ cityKey }: { cityKey: string }) {
  const { data: weather, isLoading } = useWeather(cityKey);
  const noCity = !cityKey;
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Sun className="size-4" /> Погода
      </div>
      {noCity ? (
        <div className="text-xs text-muted-foreground py-1">Добавьте дни в маршрут</div>
      ) : isLoading || !weather ? (
        <div className="text-2xl">…</div>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            <span className="text-3xl">{weather.emoji}</span>
            <div>
              <div className="text-2xl font-bold leading-none">{weather.temperature}°</div>
              <div className="text-[11px] text-muted-foreground">{weather.label}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5"><Wind className="size-3" /> {weather.wind}</span>
            <span className="flex items-center gap-0.5"><Droplets className="size-3" /> {weather.humidity}%</span>
            <span>{weather.max}°/{weather.min}°</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">{weather.city}</div>
        </div>
      )}
    </div>
  );
}

function CountdownCard({
  isBefore,
  isAfter,
  daysRemaining,
  currentDay,
  totalDays,
  startDate,
  endDate,
}: {
  isBefore: boolean;
  isAfter: boolean;
  daysRemaining: number;
  currentDay: number;
  totalDays: number;
  startDate: string;
  endDate: string | null;
}) {
  const [showEditor, setShowEditor] = useState(false);
  let icon = <Clock className="size-5" />;
  let label = "В пути";
  let value = `${currentDay}/${totalDays}`;
  let sub = `осталось ${daysRemaining} дн.`;
  let color = "#10b981";

  if (isBefore) {
    icon = <Plane className="size-5" />;
    label = "До поездки";
    value = `${daysRemaining}`;
    sub = daysRemaining === 1 ? "день" : daysRemaining < 5 ? "дня" : "дней";
    color = "#f59e0b";
  } else if (isAfter) {
    icon = <Route className="size-5" />;
    label = "Поездка завершена";
    value = "✓";
    sub = `${totalDays} дней позади`;
    color = "#8b5cf6";
  }

  const startStr = new Date(startDate).toISOString().slice(0, 10);
  const endStr = endDate ? new Date(endDate).toISOString().slice(0, 10) : "";

  return (
    <div className="col-span-2 lg:col-span-1 rounded-2xl bg-card border border-border p-4 relative overflow-hidden">
      <div
        className="absolute -top-3 -right-3 size-16 rounded-full opacity-10 blur-xl"
        style={{ background: color }}
      />
      <button
        onClick={() => setShowEditor((v) => !v)}
        className="absolute top-2 right-2 size-6 rounded-md hover:bg-accent grid place-items-center text-muted-foreground z-10"
        title="Изменить даты"
      >
        <Settings2 className="size-3.5" />
      </button>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold leading-none" style={{ color }}>{value}</span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </div>
      {/* мини-таймлайн */}
      <div className="mt-3 flex gap-0.5">
        {Array.from({ length: totalDays }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              isBefore ? "bg-muted" : isAfter ? "bg-primary" : i + 1 < currentDay ? "bg-primary" : i + 1 === currentDay ? "bg-primary/60" : "bg-muted"
            )}
          />
        ))}
      </div>

      {showEditor && <DatesEditor startStr={startStr} endStr={endStr} onDone={() => setShowEditor(false)} />}
    </div>
  );
}
