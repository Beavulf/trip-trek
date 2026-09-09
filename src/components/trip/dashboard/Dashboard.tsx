"use client";

import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { currencySymbol } from "@/lib/currencies";
import { DashboardHero } from "./DashboardHero";
import { DashboardStats } from "./DashboardStats";
import { NextPlaceWidget } from "./NextPlaceWidget";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { DailyTip } from "./DashboardWidgets";
import { RouteRail } from "./RouteRail";
import { TodayList } from "./TodayList";

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
  const { setActiveTab, setSelectedDay, setTripSwitcherOpen } = useTripStore();

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
          onClick={() => setTripSwitcherOpen(true)}
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
      <DashboardHero
        trip={trip}
        currentDay={currentDay}
        cityEmoji={cityEmoji}
        isBefore={isBefore}
        isAfter={isAfter}
        daysRemaining={daysRemaining}
      />

      <DashboardStats trip={trip} daysRemaining={daysRemaining} />

      <NextPlaceWidget trip={trip} onGoToItinerary={() => { setSelectedDay(null); setActiveTab("itinerary"); }} />

      <TodayList trip={trip} currentDay={currentDay} isBefore={isBefore} isAfter={isAfter} sym={sym} />

      <RouteRail trip={trip} />

      <DailyTip trip={trip} />
    </div>
  );
}
