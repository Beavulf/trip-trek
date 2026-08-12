"use client";

import { motion } from "framer-motion";
import { CalendarDays, MapPin, Plane, CheckCircle2, Compass } from "lucide-react";
import type { TripSummary } from "@/lib/types";

interface DashboardHeroProps {
  trip: TripSummary;
  currentDay: TripSummary["days"][number] | undefined;
  cityEmoji: string;
}

export function DashboardHero({ trip, currentDay, cityEmoji }: DashboardHeroProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl"
      style={{
        background: `linear-gradient(135deg, ${currentDay?.accentColor ?? "#f97316"} 0%, #1c1917 100%)`,
      }}
    >
      {/* Плавающие декоративные круги */}
      <motion.div
        animate={{ y: [0, -12, 0], rotate: [0, 8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-8 -right-6 text-[140px] opacity-10 select-none leading-none"
      >
        {cityEmoji}
      </motion.div>
      <div
        className="absolute -bottom-12 -left-8 size-40 rounded-full opacity-10 blur-2xl"
        style={{ background: "white" }}
      />
      <div className="relative">
        {/* Статус поездки + invite code */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/15 backdrop-blur">
            {(() => {
              const status = trip.trip?.status || "planning";
              const icon = status === "completed" ? <CheckCircle2 className="size-3" /> : status === "active" ? <Plane className="size-3" /> : <Compass className="size-3" />;
              const label = status === "completed" ? "Завершена" : status === "active" ? "В пути" : "Планирование";
              return <>{icon} {label}</>;
            })()}
          </div>
          {trip.settings.inviteCode && (
            <div className="text-[10px] text-white/60 font-mono">
              Код: {trip.settings.inviteCode.slice(0, 8)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-white/80 text-xs font-medium mb-1">
          <CalendarDays className="size-3.5" />
          День {trip.currentDayNumber} из {trip.settings.totalDays}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
          {currentDay?.title ?? `День ${trip.currentDayNumber}`}
        </h1>
        {currentDay ? (
          <p className="text-white/80 text-sm mt-1">
            {currentDay.city}
            {currentDay.summary ? ` · ${currentDay.summary}` : ""}
          </p>
        ) : (
          <p className="text-white/80 text-sm mt-1">Город не указан</p>
        )}

        {/* прогресс */}
        <div className="mt-4 space-y-2">
          <ProgressRow label="Прогресс поездки" value={trip.dayProgress} icon={<CalendarDays className="size-3.5" />} />
          <ProgressRow label="Мест посещено" value={trip.placeProgress} icon={<MapPin className="size-3.5" />}
            right={`${trip.visitedPlaces}/${trip.totalPlaces}`} />
        </div>
      </div>
    </motion.div>
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

export function timeLabel(t: string | null) {
  switch (t) {
    case "morning": return "🌅 Утро";
    case "afternoon": return "☀️ День";
    case "evening": return "🌙 Вечер";
    default: return "Весь день";
  }
}
