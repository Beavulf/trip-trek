"use client";

import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { CATEGORY_META } from "@/lib/types";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/currencies";
import { CalendarDays, CheckCircle2, ChevronRight, Circle, MapPin } from "lucide-react";
import { DashboardHero, timeLabel } from "./DashboardHero";
import { DashboardStats } from "./DashboardStats";
import { NextPlaceWidget } from "./NextPlaceWidget";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { ActivityChart, DailyTip } from "./DashboardWidgets";

const CITY_EMOJI: Record<string, string> = {
  "": "🏙️",
  guangzhou: "🏯",
  shenzhen: "🏙️",
  hongkong: "🌃",
  macau: "🎰",
  tokyo: "🗾",
  paris: "🗼",
  bangkok: "🛕",
  phuket: "🏖️",
  seoul: "🇰🇷",
  singapore: "🦁",
  dubai: "🕌",
};

export function Dashboard() {
  const tripId = useCurrentTripId();
  const { data: trip, isLoading, isError, refetch } = useTrip();
  const { setActiveTab, setSelectedDay } = useTripStore();

  if (!tripId) {
    return (
      <div className="py-16 text-center space-y-3 animate-fade-up">
        <div className="text-4xl">🧭</div>
        <p className="text-sm font-medium">Нет активной поездки</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Создай поездку или выбери существующую
        </p>
        <button
          type="button"
          onClick={() => useTripStore.getState().setTripSwitcherOpen(true)}
          className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Мои поездки →
        </button>
      </div>
    );
  }

  if (isLoading && !trip) {
    return <DashboardSkeleton />;
  }

  if (isError || !trip) {
    return (
      <div className="py-16 text-center space-y-3 animate-fade-up">
        <div className="text-4xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить обзор</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Поездка недоступна или произошла ошибка сети.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-1 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-[44px]"
        >
          Повторить
        </button>
      </div>
    );
  }

  const currentDay = trip.days.find((d) => d.dayNumber === trip.currentDayNumber);
  const currentCityKey = currentDay?.cityKey ?? "";
  const cityEmoji = CITY_EMOJI[currentCityKey] ?? "🏙️";
  const sym = currencySymbol(trip.settings.currency);

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
      <DashboardHero trip={trip} currentDay={currentDay} cityEmoji={cityEmoji} />

      <DashboardStats
        trip={trip}
        isBefore={isBefore}
        isAfter={isAfter}
        daysRemaining={daysRemaining}
        currentCityKey={currentCityKey}
      />

      <NextPlaceWidget trip={trip} onGoToItinerary={() => { setSelectedDay(null); setActiveTab("itinerary"); }} />

      <DailyTip trip={trip} />

      {/* Дни — горизонтальный скролл + список */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <CalendarDays className="size-4" /> Маршрут по дням
          </h2>
          <button
            type="button"
            onClick={() => setActiveTab("itinerary")}
            className="text-xs text-primary flex items-center gap-1 hover:underline min-h-11 px-2"
          >
            Все дни <ChevronRight className="size-3" />
          </button>
        </div>

        <div className="chip-rail no-scrollbar gap-2">
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
                      {p.budget ? <span>· {sym}{p.budget}</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ActivityChart trip={trip} />
    </div>
  );
}
