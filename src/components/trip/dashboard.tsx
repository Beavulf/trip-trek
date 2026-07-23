"use client";

import { useTrip, useWeather, useUpdateTripDates } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { motion } from "framer-motion";
import {
  MapPin,
  Camera,
  BookOpen,
  Wallet,
  TrendingDown,
  Sun,
  Wind,
  Droplets,
  ChevronRight,
  CheckCircle2,
  Circle,
  CalendarDays,
  Plane,
  Clock,
  Route,
  Settings2,
} from "lucide-react";
import { CITIES, CATEGORY_META } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

const CITY_EMOJI: Record<string, string> = {
  guangzhou: "🏯",
  shenzhen: "🏙️",
  hongkong: "🌃",
  macau: "🎰",
};

export function Dashboard() {
  const { data: trip, isLoading } = useTrip();
  const { setActiveTab, setSelectedDay } = useTripStore();

  if (isLoading || !trip) {
    return <DashboardSkeleton />;
  }

  const currentDay = trip.days.find((d) => d.dayNumber === trip.currentDayNumber);
  const currentCityKey = currentDay?.cityKey ?? "guangzhou";
  const cityEmoji = CITY_EMOJI[currentCityKey] ?? "🏯";

  // Обратный отсчёт / прогресс по времени
  const now = new Date();
  const start = new Date(trip.settings.startDate);
  start.setHours(0, 0, 0, 0);
  const end = trip.settings.endDate
    ? new Date(trip.settings.endDate)
    : new Date(start);
  if (!trip.settings.endDate) {
    end.setDate(end.getDate() + trip.settings.totalDays - 1);
  }
  end.setHours(23, 59, 59, 999);

  const isBefore = now < start;
  const isAfter = now > end;
  const daysRemaining = isBefore
    ? Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : isAfter
    ? 0
    : Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Hero — текущий день */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl"
        style={{
          background: `linear-gradient(135deg, ${currentDay?.accentColor ?? "#f97316"} 0%, #1c1917 100%)`,
        }}
      >
        <div className="absolute -top-6 -right-4 text-[140px] opacity-10 select-none leading-none">
          {cityEmoji}
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-xs font-medium mb-1">
            <CalendarDays className="size-3.5" />
            День {trip.currentDayNumber} из {trip.settings.totalDays}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{currentDay?.title}</h1>
          <p className="text-white/80 text-sm mt-1">
            {currentDay?.city} · {currentDay?.summary}
          </p>

          {/* прогресс */}
          <div className="mt-4 space-y-2">
            <ProgressRow label="Прогресс поездки" value={trip.dayProgress} icon={<CalendarDays className="size-3.5" />} />
            <ProgressRow label="Мест посещено" value={trip.placeProgress} icon={<MapPin className="size-3.5" />}
              right={`${trip.visitedPlaces}/${trip.totalPlaces}`} />
          </div>
        </div>
      </motion.div>

      {/* Сетка виджетов */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Обратный отсчёт / статус поездки */}
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

        {/* Погода */}
        <WeatherWidget cityKey={currentCityKey} />

        {/* Фото */}
        <StatCard
          icon={<Camera className="size-5" />}
          value={trip.totalPhotos}
          label="Фото"
          color="#06b6d4"
          onClick={() => setActiveTab("gallery")}
        />

        {/* Места */}
        <StatCard
          icon={<MapPin className="size-5" />}
          value={trip.visitedPlaces}
          label={`из ${trip.totalPlaces} мест`}
          color="#f97316"
          onClick={() => setActiveTab("itinerary")}
        />

        {/* Дневник */}
        <StatCard
          icon={<BookOpen className="size-5" />}
          value={trip.totalJournals}
          label="Записей"
          color="#8b5cf6"
          onClick={() => setActiveTab("journal")}
        />
      </div>

      {/* Дни — горизонтальный скролл + список */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <CalendarDays className="size-4" /> Маршрут по дням
          </h2>
          <button
            onClick={() => setActiveTab("itinerary")}
            className="text-xs text-primary flex items-center gap-1 hover:underline"
          >
            Все дни <ChevronRight className="size-3" />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {trip.days.map((d) => {
            const visited = d.places.filter((p) => p.status === "visited").length;
            const isCurrent = d.dayNumber === trip.currentDayNumber;
            const isPast = d.dayNumber < trip.currentDayNumber;
            return (
              <button
                key={d.id}
                onClick={() => {
                  setSelectedDay(d.dayNumber);
                  setActiveTab("itinerary");
                }}
                className={cn(
                  "min-w-[160px] rounded-xl border p-3 text-left transition-all hover:shadow-md",
                  isCurrent ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/40"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="size-7 rounded-lg grid place-items-center text-white text-xs font-bold"
                    style={{ background: d.accentColor ?? "#f97316" }}
                  >
                    {d.dayNumber}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{d.city}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {isCurrent ? "сегодня" : isPast ? "прошёл" : "впереди"}
                    </div>
                  </div>
                </div>
                <div className="text-xs font-medium line-clamp-2 leading-tight mb-2">{d.title}</div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <CheckCircle2 className="size-3" />
                  {visited}/{d.places.length} мест
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${d.places.length ? (visited / d.places.length) * 100 : 0}%`,
                      background: d.accentColor ?? "#f97316",
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Места сегодняшнего дня */}
      {currentDay && (
        <div className="rounded-2xl bg-card border border-border p-4">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <MapPin className="size-4" /> Сегодня в плане
          </h2>
          <div className="space-y-2">
            {currentDay.places.map((p) => {
              const meta = CATEGORY_META[p.category];
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg transition-colors",
                    p.status === "visited" ? "opacity-60" : "hover:bg-accent"
                  )}
                >
                  {p.status === "visited" ? (
                    <CheckCircle2 className="size-5 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="size-5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-lg">{meta?.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm font-medium truncate", p.status === "visited" && "line-through")}>
                      {p.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span>{timeLabel(p.timeOfDay)}</span>
                      {p.budget ? <span>· ${p.budget}</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressRow({ label, value, icon, right }: { label: string; value: number; icon: React.ReactNode; right?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-white/80 mb-0.5">
        <span className="flex items-center gap-1">{icon} {label}</span>
        {right && <span>{right}</span>}
      </div>
      <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full rounded-full bg-white"
        />
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, color, onClick }: { icon: React.ReactNode; value: number; label: string; color: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl bg-card border border-border p-4 text-left hover:shadow-lg transition-shadow"
    >
      <div className="size-9 rounded-lg grid place-items-center mb-2" style={{ background: `${color}22`, color }}>
        {icon}
      </div>
      <div className="text-2xl font-bold leading-none">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </button>
  );
}

function WeatherWidget({ cityKey }: { cityKey: string }) {
  const { data: weather, isLoading } = useWeather(cityKey);
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Sun className="size-4" /> Погода
      </div>
      {isLoading || !weather ? (
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

function timeLabel(t: string | null) {
  switch (t) {
    case "morning": return "🌅 Утро";
    case "afternoon": return "☀️ День";
    case "evening": return "🌙 Вечер";
    default: return "Весь день";
  }
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

function DatesEditor({ startStr, endStr, onDone }: { startStr: string; endStr: string; onDone: () => void }) {
  const update = useUpdateTripDates();
  const [start, setStart] = useState(startStr);
  const [end, setEnd] = useState(endStr);

  const save = async () => {
    await update.mutateAsync({ startDate: start, endDate: end || undefined });
    toast.success("Даты обновлены");
    onDone();
  };

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2 relative z-20">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Вылет ✈️</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full text-xs rounded-lg border border-input bg-background px-2 py-1.5"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Прилёт обратно 🛬</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full text-xs rounded-lg border border-input bg-background px-2 py-1.5"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-lg bg-secondary py-1.5 text-xs font-medium">
          Отмена
        </button>
        <button
          onClick={save}
          disabled={update.isPending}
          className="flex-1 rounded-lg bg-primary text-primary-foreground py-1.5 text-xs font-medium"
        >
          {update.isPending ? "…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="rounded-3xl h-40 bg-muted" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="col-span-2 lg:col-span-1 rounded-2xl h-24 bg-muted" />
        <div className="col-span-2 lg:col-span-1 rounded-2xl h-24 bg-muted" />
        <div className="rounded-2xl h-24 bg-muted" />
        <div className="rounded-2xl h-24 bg-muted" />
      </div>
      <div className="rounded-2xl h-32 bg-muted" />
      <div className="rounded-2xl h-48 bg-muted" />
    </div>
  );
}
