"use client";

import { useTrip, useExpenses, usePhotos, useJournal } from "@/hooks/use-trip";
import { CATEGORY_META, type Photo } from "@/lib/types";
import { useTripStore, type TripTab } from "@/lib/trip-store";
import { motion } from "framer-motion";
import { MapPin, Camera, Wallet, BookOpen, Clock, Loader2, Rss, Plus, Images, Sparkles, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
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
  photoUrl?: string;
  photoThumb?: string;
  targetTab?: string;
}

const FILTERS = [
  { key: "all", label: "Все", emoji: "✨" },
  { key: "place", label: "Места", emoji: "📍" },
  { key: "photo", label: "Фото", emoji: "📸" },
  { key: "expense", label: "Траты", emoji: "💸" },
  { key: "journal", label: "Дневник", emoji: "📔" },
] as const;

const MAX_EVENTS = 50;

export function Timeline() {
  const { data: trip, isLoading: tripLoading, isError: tripError } = useTrip();
  const { data: expenses, isLoading: expensesLoading } = useExpenses();
  const { data: photos, isLoading: photosLoading } = usePhotos();
  const { data: journals, isLoading: journalsLoading } = useJournal();
  const { setActiveTab } = useTripStore();
  const [filter, setFilter] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);

  const currency = trip?.settings?.currency || "USD";
  const currencySymbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "CNY" ? "¥" : currency === "RUB" ? "₽" : currency === "JPY" ? "¥" : currency === "GBP" ? "£" : "$";

  const events = useMemo<TimelineEvent[]>(() => {
    if (!trip) return [];
    const evts: TimelineEvent[] = [];

    // Места (только посещённые)
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
            targetTab: "itinerary",
          });
        }
      });
    });

    // Фото
    photos?.forEach((p: Photo) => {
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
        photoUrl: p.url,
        photoThumb: p.thumbUrl || p.url,
        targetTab: "gallery",
      });
    });

    // Траты (исключаем settlement — это переводы, не траты)
    expenses?.forEach((e) => {
      if (e.category === "settlement") return;
      evts.push({
        id: `expense-${e.id}`,
        type: "expense",
        timestamp: e.createdAt,
        title: e.description,
        subtitle: `${currencySymbol}${e.amount.toFixed(2)}`,
        meta: e.paidBy?.name,
        icon: Wallet,
        color: "#10b981",
        emoji: "💸",
        targetTab: "budget",
      });
    });

    // Дневник
    journals?.forEach((j) => {
      evts.push({
        id: `journal-${j.id}`,
        type: "journal",
        timestamp: j.createdAt,
        title: j.content.slice(0, 60) + (j.content.length > 60 ? "…" : ""),
        subtitle: j.mood || undefined,
        meta: j.user?.name,
        icon: BookOpen,
        color: "#8b5cf6",
        emoji: "📔",
        targetTab: "journal",
      });
    });

    // Сортировка по времени (новые сверху), guard от NaN
    evts.sort((a, b) => {
      const tsA = new Date(a.timestamp).getTime();
      const tsB = new Date(b.timestamp).getTime();
      if (isNaN(tsA) && isNaN(tsB)) return 0;
      if (isNaN(tsA)) return 1;
      if (isNaN(tsB)) return -1;
      return tsB - tsA;
    });

    return evts;
  }, [trip, expenses, photos, journals, currencySymbol]);

  // Фильтрация
  const filtered = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((e) => e.type === filter);
  }, [events, filter]);

  // Лимит для производительности
  const displayed = showAll ? filtered : filtered.slice(0, MAX_EVENTS);

  // Группировка по дням (ISO ключ + красивый заголовок с годом)
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; events: TimelineEvent[] }>();
    filtered.forEach((e) => {
      const date = new Date(e.timestamp);
      if (isNaN(date.getTime())) return;
      const isoKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const label = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
      const existing = map.get(isoKey);
      if (existing) {
        existing.events.push(e);
      } else {
        map.set(isoKey, { label, events: [e] });
      }
    });
    return Array.from(map.entries());
  }, [filtered]);

  // Статистика по типам
  const stats = useMemo(() => ({
    places: events.filter((e) => e.type === "place").length,
    photos: events.filter((e) => e.type === "photo").length,
    expenses: events.filter((e) => e.type === "expense").length,
    journals: events.filter((e) => e.type === "journal").length,
  }), [events]);

  const loading = tripLoading || expensesLoading || photosLoading || journalsLoading;

  // Нет поездки
  if (!tripLoading && !trip) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">📰</div>
          <h1 className="text-xl font-bold">Лента пуста</h1>
          <p className="text-white/80 text-sm mt-1">Создай или присоединись к поездке</p>
          <button
            onClick={() => setActiveTab("dashboard")}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-2.5 text-sm font-medium active:scale-95 transition-transform"
          >
            На главную →
          </button>
        </div>
      </div>
    );
  }

  // Ошибка загрузки
  if (tripError) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-red-500/10 border border-red-500/20 text-center">
          <div className="text-5xl mb-3">⚠️</div>
          <h1 className="text-lg font-bold">Не удалось загрузить</h1>
          <p className="text-muted-foreground text-sm mt-1">Проверь подключение к интернету</p>
        </div>
      </div>
    );
  }

  // Загрузка
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Загрузка ленты…
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-4 text-[120px] opacity-15 select-none leading-none">📰</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <Rss className="size-4" /> Лента поездки
          </div>
          <h1 className="text-2xl font-bold">Хронология событий</h1>
          <div className="flex gap-3 mt-2 text-xs text-white/90">
            <span>📍 {stats.places}</span>
            <span>📸 {stats.photos}</span>
            <span>💸 {stats.expenses}</span>
            <span>📔 {stats.journals}</span>
          </div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {FILTERS.map((f) => {
          const count = f.key === "all" ? events.length : stats[f.key as keyof typeof stats];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95 shrink-0",
                filter === f.key ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
              )}
            >
              <span>{f.emoji}</span> {f.label}
              {count > 0 && (
                <span className={cn(
                  "ml-0.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold grid place-items-center",
                  filter === f.key ? "bg-white/25" : "bg-muted"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* События по дням */}
      {grouped.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <div className="text-4xl mb-3 opacity-50">📭</div>
          <p className="text-sm font-medium text-muted-foreground">Пока нет событий</p>
          <p className="text-xs text-muted-foreground/70 mt-1 mb-4">Отмечайте места, добавляйте фото и траты</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setActiveTab("itinerary")}
              className="rounded-lg bg-secondary border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors active:scale-95 flex items-center gap-1"
            >
              <MapPin className="size-3" /> Маршрут
            </button>
            <button
              onClick={() => setActiveTab("gallery")}
              className="rounded-lg bg-secondary border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors active:scale-95 flex items-center gap-1"
            >
              <Images className="size-3" /> Галерея
            </button>
            <button
              onClick={() => setActiveTab("budget")}
              className="rounded-lg bg-secondary border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors active:scale-95 flex items-center gap-1"
            >
              <Wallet className="size-3" /> Бюджет
            </button>
            <button
              onClick={() => setActiveTab("journal")}
              className="rounded-lg bg-secondary border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors active:scale-95 flex items-center gap-1"
            >
              <BookOpen className="size-3" /> Дневник
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([isoKey, { label, events: dayEvents }]) => {
            const visibleEvents = showAll ? dayEvents : dayEvents.slice(0, MAX_EVENTS);
            return (
              <div key={isoKey}>
                {/* Дата */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="size-7 rounded-lg bg-primary/10 text-primary grid place-items-center text-xs font-bold">
                    <Clock className="size-3.5" />
                  </div>
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-muted-foreground">{dayEvents.length} событий</div>
                </div>

                {/* События */}
                <div className="relative pl-4 ml-3 border-l-2 border-border space-y-2">
                  {visibleEvents.map((e) => {
                    const Icon = e.icon;
                    return (
                      <button
                        key={e.id}
                        onClick={() => e.targetTab && setActiveTab(e.targetTab as TripTab)}
                        className="relative block w-full text-left active:scale-[0.98] transition-transform"
                      >
                        {/* Точка на таймлайне */}
                        <div
                          className="absolute -left-[22px] top-2.5 size-3 rounded-full border-2 border-background z-10"
                          style={{ background: e.color }}
                        />
                        {/* Карточка */}
                        <div className="rounded-xl bg-card border border-border p-3 card-hover w-full">
                          <div className="flex items-start gap-2.5">
                            <div
                              className="size-8 rounded-lg grid place-items-center text-sm shrink-0"
                              style={{ background: `${e.color}22`, color: e.color }}
                            >
                              {e.emoji || <Icon className="size-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-medium leading-tight line-clamp-1">{e.title}</div>
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
                                  {(() => {
                                    const ts = new Date(e.timestamp);
                                    return isNaN(ts.getTime()) ? "—" : ts.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
                                  })()}
                                </span>
                                {e.meta && <span>· {e.meta}</span>}
                                {e.targetTab && <ChevronRight className="size-2.5 ml-auto opacity-50" />}
                              </div>
                            </div>
                            {/* Мини-фото */}
                            {e.type === "photo" && e.photoThumb && (
                              <img
                                src={e.photoThumb}
                                alt={e.title || "Фото"}
                                className="size-12 rounded-lg object-cover shrink-0"
                                loading="lazy"
                              />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Показать ещё */}
          {!showAll && filtered.length > MAX_EVENTS && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full rounded-xl border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors active:scale-95"
            >
              Показать ещё ({filtered.length - MAX_EVENTS})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
