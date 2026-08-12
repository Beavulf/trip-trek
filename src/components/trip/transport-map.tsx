"use client";

import { useDays, useTrip } from "@/hooks/use-trip";
import { motion } from "framer-motion";
import { Train, Clock, MapPin, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Переезды строятся из дней маршрута — без China-хардкода. */
export function TransportMap() {
  const { data: days, isLoading } = useDays();
  const { data: trip } = useTrip();

  const transfers = (days || [])
    .slice(0, -1)
    .map((d, i) => {
      const next = days![i + 1];
      if (!next || d.cityKey === next.cityKey) return null;
      return {
        from: { key: d.cityKey, name: d.city, color: d.accentColor },
        to: { key: next.cityKey, name: next.city, color: next.accentColor },
        dayNumber: next.dayNumber,
      };
    })
    .filter(Boolean) as Array<{
    from: { key: string; name: string; color: string | null };
    to: { key: string; name: string; color: string | null };
    dayNumber: number;
  }>;

  if (isLoading) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Загрузка…</div>;
  }

  if (!trip || !days?.length) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-4xl opacity-50">🚆</div>
        <p className="text-sm font-medium">Нет маршрута</p>
        <p className="text-xs">Добавьте дни с разными городами — переезды появятся здесь</p>
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-4xl opacity-50">📍</div>
        <p className="text-sm font-medium">Переездов нет</p>
        <p className="text-xs">Все дни в одном городе или один день в маршруте</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      <div className="rounded-3xl p-5 bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-xl">
        <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
          <Train className="size-4" /> Переезды
        </div>
        <h1 className="text-2xl font-bold">{trip.settings.title}</h1>
        <p className="text-white/80 text-sm mt-1">
          {transfers.length} переезд{transfers.length === 1 ? "" : transfers.length < 5 ? "а" : "ов"} между городами
        </p>
      </div>

      <div className="space-y-3">
        {transfers.map((t, i) => (
          <motion.div
            key={`${t.from.key}-${t.to.key}-${t.dayNumber}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl bg-card border border-border p-4"
          >
            <div className="flex items-center gap-3">
              <div
                className="size-10 rounded-xl grid place-items-center text-white text-sm font-bold shrink-0"
                style={{ background: t.from.color || "#0ea5e9" }}
              >
                <MapPin className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold flex-wrap">
                  <span>{t.from.name}</span>
                  <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
                  <span>{t.to.name}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="size-3" /> К дню {t.dayNumber}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <p className={cn("text-[10px] text-muted-foreground px-1")}>
        Подсказки по транспорту добавляйте в заметки дня или чат поездки.
      </p>
    </div>
  );
}
