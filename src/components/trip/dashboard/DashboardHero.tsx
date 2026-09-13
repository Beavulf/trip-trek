"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  Compass,
  Pencil,
  Plane,
  Users,
} from "lucide-react";
import type { TripSummary } from "@/lib/types";
import { plural } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useWeather } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { DatesEditor } from "./DatesEditor";

interface DashboardHeroProps {
  trip: TripSummary;
  currentDay: TripSummary["days"][number] | undefined;
  cityEmoji: string;
  isBefore: boolean;
  isAfter: boolean;
  daysRemaining: number;
}

// Приветствие по времени суток (перекликается с Chill) — считаем только на клиенте,
// чтобы не ловить hydration mismatch.
function dayGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: "Доброе утро", emoji: "☀️" };
  if (h >= 12 && h < 18) return { text: "Добрый день", emoji: "🌤️" };
  if (h >= 18 && h < 23) return { text: "Добрый вечер", emoji: "🌆" };
  return { text: "Доброй ночи", emoji: "🌙" };
}

function dateRu(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function DashboardHero({
  trip,
  currentDay,
  cityEmoji,
  isBefore,
  isAfter,
  daysRemaining,
}: DashboardHeroProps) {
  const reduceMotion = useReducedMotion();
  const { setActiveTab } = useTripStore();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const isOwner = !!trip.participants?.find((p) => p.role === "owner" && p.id === currentUserId);

  const [showDates, setShowDates] = useState(false);
  const [greeting, setGreeting] = useState<{ text: string; emoji: string } | null>(null);
  useEffect(() => {
    // Час зависит от устройства — считаем на монтировании (SSR рендерит fallback).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(dayGreeting());
  }, []);

  const status = trip.trip?.status || "planning";
  const inviteCode = trip.trip?.inviteCode ?? trip.settings.inviteCode;
  const totalDays = trip.settings.totalDays;
  const currentCityKey = currentDay?.cityKey ?? "";

  // Заголовок и подзаголовок зависят от того, где мы во времени.
  let title: string;
  let subtitle: string;
  if (isBefore) {
    title = `${daysRemaining} ${plural(daysRemaining, "день", "дня", "дней")} до вылета`;
    subtitle = `Вылет ${dateRu(trip.settings.startDate)}${currentDay ? ` · ${currentDay.city}` : ""}`;
  } else if (isAfter) {
    title = trip.settings.title;
    subtitle = `${totalDays} дней · ${trip.visitedPlaces} из ${trip.totalPlaces} мест · ${trip.totalPhotos} фото`;
  } else {
    title = currentDay?.title ?? `День ${trip.currentDayNumber}`;
    subtitle = currentDay
      ? `${currentDay.city}${currentDay.summary ? ` · ${currentDay.summary}` : ""}`
      : "Город не указан";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl"
      style={{
        background: `linear-gradient(135deg, ${currentDay?.accentColor ?? "#f97316"} 0%, #1c1917 100%)`,
      }}
    >
      {/* Плавающий city-эмодзи + мягкое пятно света */}
      {!reduceMotion && (
        <motion.div
          animate={{ y: [0, -12, 0], rotate: [0, 8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-8 -right-6 text-[140px] opacity-10 select-none leading-none"
          aria-hidden="true"
        >
          {cityEmoji}
        </motion.div>
      )}
      {reduceMotion && (
        <div className="absolute -top-8 -right-6 text-[140px] opacity-10 select-none leading-none" aria-hidden="true">
          {cityEmoji}
        </div>
      )}
      <div className="absolute -bottom-12 -left-8 size-40 rounded-full opacity-10 blur-2xl bg-white" aria-hidden="true" />

      <div className="relative">
        {/* Статус · погода · даты (владельцу) */}
        <div className="flex items-center gap-1.5 mb-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/15 backdrop-blur">
            {status === "completed" ? (
              <><CheckCircle2 className="size-3" /> Завершена</>
            ) : status === "active" ? (
              <><Plane className="size-3" /> В пути</>
            ) : (
              <><Compass className="size-3" /> Планирование</>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <WeatherChip cityKey={currentCityKey} />
            {isOwner && !showDates && (
              <button
                type="button"
                onClick={() => setShowDates(true)}
                className="size-11 rounded-xl bg-white/15 hover:bg-white/25 grid place-items-center transition-colors"
                title="Изменить даты"
                aria-label="Изменить даты"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-white/70 mb-1" aria-live="polite">
          {greeting ? `${greeting.emoji} ${greeting.text}` : "\u00A0"}
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{title}</h1>
        <p className="text-white/80 text-sm mt-1">{subtitle}</p>

        {/* Прогресс: дни и места */}
        <div className="mt-4 space-y-2">
          <ProgressRow
            label="Прогресс поездки"
            value={trip.dayProgress}
            right={isAfter ? `${totalDays} дн. позади` : !isBefore && daysRemaining > 0 ? `осталось ${daysRemaining} дн.` : undefined}
          />
          <ProgressRow label="Мест посещено" value={trip.placeProgress} right={`${trip.visitedPlaces}/${trip.totalPlaces}`} />
        </div>

        {/* Пригласить друзей — код с Code теперь кнопка, а не мелкий текст в углу */}
        {inviteCode && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("triptrek-open-invite"))}
            className="mt-4 w-full min-h-11 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors active:scale-[0.98]"
          >
            <Users className="size-4" />
            Позвать друзей
            <span className="font-mono text-[11px] text-white/70">{inviteCode}</span>
          </button>
        )}

        {showDates && isOwner && (
          <DatesEditor
            startStr={new Date(trip.settings.startDate).toISOString().slice(0, 10)}
            endStr={trip.settings.endDate ? new Date(trip.settings.endDate).toISOString().slice(0, 10) : ""}
            onDone={() => setShowDates(false)}
          />
        )}
      </div>
    </motion.div>
  );
}

function ProgressRow({ label, value, right }: { label: string; value: number; right?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-white/80 mb-0.5">
        <span>{label}</span>
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

/** Компактная погода: тап ведёт в раздел «Погода». Без города или при ошибке — не показываем. */
function WeatherChip({ cityKey }: { cityKey: string }) {
  const { setActiveTab } = useTripStore();
  const { data: weather, isLoading } = useWeather(cityKey);

  if (!cityKey) return null;
  if (isLoading) {
    return <span className="size-11 rounded-xl bg-white/10 animate-pulse" aria-hidden="true" />;
  }
  if (!weather) return null;
  return (
    <button
      type="button"
      onClick={() => setActiveTab("weather")}
      className="min-h-11 px-2.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur flex items-center gap-1 text-sm font-semibold transition-colors"
      title={`${weather.label}, ${weather.city}`}
      aria-label={`Погода ${weather.temperature}° — открыть раздел Погода`}
    >
      <span aria-hidden="true">{weather.emoji}</span> {weather.temperature}°
    </button>
  );
}
