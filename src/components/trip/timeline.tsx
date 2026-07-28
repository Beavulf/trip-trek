"use client";

import { useTrip, useExpenses, usePhotos } from "@/hooks/use-trip";
import { CATEGORY_META, CITIES, type Expense, type Photo } from "@/lib/types";
import { motion } from "framer-motion";
import { MapPin, Camera, Wallet, BookOpen, Clock, Loader2, Rss } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  id: string;
  type: "place" | "photo" | "expense" | "journal";
  timestamp: string;
  title: string;
  subtitle?: string;
  meta?: string;
  icon: typeof MapPin;
  color: string;
  emoji?: string;
}

export function Timeline() {
  const { data: trip, isLoading: tripLoading } = useTrip();
  const { data: expenses } = useExpenses();
  const { data: photos } = usePhotos();

  const events = useMemo<TimelineEvent[]>(() => {
    if (!trip) return [];
    const evts: TimelineEvent[] = [];

    // Места
    trip.days.forEach((day) => {
      day.places.forEach((p) => {
        if (p.status === "visited") {
          const meta = CATEGORY_META[p.category];
          evts.push({
            id: `place-${p.id}`,
            type: "place",
            timestamp: p.visitedAt || day.date,
            title: p.name,
            subtitle: p.description?.slice(0, 80),
            meta: `День ${day.dayNumber} · ${day.city}`,
            icon: MapPin,
            color: meta?.color ?? "#f97316",
            emoji: meta?.emoji,
          });
        }
      });
    });

    // Фото
    photos?.forEach((p) => {
      evts.push({
        id: `photo-${p.id}`,
        type: "photo",
        timestamp: p.takenAt,
        title: p.caption || "Фото",
        subtitle: p.address?.slice(0, 60),
        meta: p.user?.name,
        icon: Camera,
        color: "#06b6d4",
        emoji: "📸",
      });
    });

    // Траты
    expenses?.forEach((e) => {
      evts.push({
        id: `expense-${e.id}`,
        type: "expense",
        timestamp: e.createdAt,
        title: e.description,
        subtitle: `$${e.amount}`,
        meta: e.paidBy?.name,
        icon: Wallet,
        color: "#10b981",
        emoji: "💸",
      });
    });

    // Дневник
    trip.days.forEach((day) => {
      // journals нет в trip, пропускаем
    });

    // Сортировка по времени (новые сверху)
    evts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return evts;
  }, [trip, expenses, photos]);

  // Группировка по дням
  const grouped = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    events.forEach((e) => {
      const date = new Date(e.timestamp);
      const key = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    });
    return Array.from(map.entries());
  }, [events]);

  if (tripLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Загрузка ленты…
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-4 text-[120px] opacity-15 select-none leading-none">📰</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <Rss className="size-4" /> Лента поездки
          </div>
          <h1 className="text-2xl font-bold">Хронология событий</h1>
          <p className="text-white/80 text-sm mt-1">{events.length} событий · все в одном потоке</p>
        </div>
      </div>

      {/* События по дням */}
      {grouped.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">Пока нет событий</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Отмечайте места, добавляйте фото и траты</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, dayEvents]) => (
            <div key={date}>
              {/* Дата */}
              <div className="flex items-center gap-2 mb-2">
                <div className="size-7 rounded-lg bg-primary/10 text-primary grid place-items-center text-xs font-bold">
                  <Clock className="size-3.5" />
                </div>
                <div className="text-sm font-semibold">{date}</div>
                <div className="text-xs text-muted-foreground">{dayEvents.length} событий</div>
              </div>

              {/* События */}
              <div className="relative pl-4 ml-3 border-l-2 border-border space-y-2">
                {dayEvents.map((e, i) => {
                  const Icon = e.icon;
                  return (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="relative"
                    >
                      {/* Точка на таймлайне */}
                      <div
                        className="absolute -left-[22px] top-2.5 size-3 rounded-full border-2 border-background z-10"
                        style={{ background: e.color }}
                      />
                      {/* Карточка */}
                      <div className="rounded-xl bg-card border border-border p-3 card-hover">
                        <div className="flex items-start gap-2.5">
                          <div
                            className="size-8 rounded-lg grid place-items-center text-sm shrink-0"
                            style={{ background: `${e.color}22`, color: e.color }}
                          >
                            {e.emoji || <Icon className="size-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-medium leading-tight truncate">{e.title}</div>
                              {e.type === "expense" && (
                                <div className="text-sm font-bold text-green-600 shrink-0">{e.subtitle}</div>
                              )}
                            </div>
                            {e.type !== "expense" && e.subtitle && (
                              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{e.subtitle}</div>
                            )}
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-0.5">
                                <Clock className="size-2.5" />
                                {new Date(e.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {e.meta && <span>· {e.meta}</span>}
                            </div>
                          </div>
                          {/* Мини-фото для фото-событий */}
                          {e.type === "photo" && photos?.find((p) => `photo-${p.id}` === e.id)?.url && (
                            <img
                              src={photos.find((p) => `photo-${p.id}` === e.id)?.url}
                              alt=""
                              className="size-12 rounded-lg object-cover shrink-0"
                            />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
