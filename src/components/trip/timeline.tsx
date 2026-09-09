"use client";

import { useTrip, useExpenses, usePhotos, useJournal, useCurrentTripId } from "@/hooks/use-trip";
import { CATEGORY_META, EXPENSE_CATEGORIES, type Day, type Photo } from "@/lib/types";
import { useTripStore, type TripTab } from "@/lib/trip-store";
import { BookOpen, Camera, ChevronRight, Images, MapPin, Rss, Wallet } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import { cn, plural } from "@/lib/utils";
import { currencySymbol as curSym } from "@/lib/currencies";
import { MobileBottomSheet } from "./mobile-bottom-sheet";

type EventType = "place" | "photo" | "expense" | "journal";

interface TimelineEvent {
  id: string;
  type: EventType;
  timestamp: string;
  title: string;
  subtitle?: string;
  meta?: string;
  icon: typeof MapPin;
  color: string;
  emoji?: string;
  photoUrl?: string;
  photoThumb?: string;
  targetTab: TripTab;
  dayNumber?: number;
  /** Плановый день маршрута (для мест) — показываем в деталях */
  plannedDay?: number;
  /** Кто совершил действие — аватар с эмодзи и цветом участника */
  actor?: { name: string; emoji: string; color: string };
  categoryLabel?: string;
  /** Полный текст для диалога деталей (описание места, запись дневника) */
  fullText?: string | null;
  address?: string | null;
  amount?: number;
  originalAmount?: number | null;
  originalCurrency?: string | null;
  mood?: string | null;
}

const FILTERS: { key: EventType | "all"; label: string; emoji: string }[] = [
  { key: "all", label: "Все", emoji: "✨" },
  { key: "place", label: "Места", emoji: "📍" },
  { key: "photo", label: "Фото", emoji: "📸" },
  { key: "expense", label: "Траты", emoji: "💸" },
  { key: "journal", label: "Дневник", emoji: "📔" },
];

const TYPE_META: Record<EventType, { sheetTitle: string; cta: string; emptyTitle: string; emptyHint: string }> = {
  place: {
    sheetTitle: "Место посещено",
    cta: "Открыть маршрут",
    emptyTitle: "Посещённых мест пока нет",
    emptyHint: "Отметьте первое место на маршруте — оно появится в хронике",
  },
  photo: {
    sheetTitle: "Новое фото",
    cta: "Открыть галерею",
    emptyTitle: "Фотографий пока нет",
    emptyHint: "Добавьте снимок в галерею — он сразу попадёт в хронику",
  },
  expense: {
    sheetTitle: "Трата",
    cta: "Открыть бюджет",
    emptyTitle: "Трат пока нет",
    emptyHint: "Запишите первую трату в бюджете — она появится в хронике",
  },
  journal: {
    sheetTitle: "Запись в дневнике",
    cta: "Открыть дневник",
    emptyTitle: "Записей пока нет",
    emptyHint: "Оставьте заметку в дневнике — она появится в хронике",
  },
};

const MAX_EVENTS = 50;

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Человекочитаемое время: «2 ч назад», «вчера, 18:40», «пн, 09:15», «12 авг» */
function relTime(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)} ч назад`;
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, yesterday)) return `вчера, ${hm}`;
  if (diffMin < 7 * 24 * 60) return `${d.toLocaleDateString("ru-RU", { weekday: "short" })}, ${hm}`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

interface DayGroup {
  key: string;
  label: string;
  weekday: string;
  dayNo: number | null;
  isToday: boolean;
  isYesterday: boolean;
  counts: Record<EventType, number>;
  spent: number;
  events: TimelineEvent[];
}

export function Timeline() {
  const tripId = useCurrentTripId();
  const { data: trip, isLoading: tripLoading, isError: tripError, refetch } = useTrip();
  const { data: expenses, isLoading: expensesLoading } = useExpenses();
  const { data: photos, isLoading: photosLoading } = usePhotos();
  const { data: journals, isLoading: journalsLoading } = useJournal();
  const { setActiveTab, setSelectedDay } = useTripStore();
  const [filter, setFilter] = useState<EventType | "all">("all");
  const [showAll, setShowAll] = useState(false);
  const [sheetEvent, setSheetEvent] = useState<TimelineEvent | null>(null);
  const reduceMotion = useReducedMotion();

  const currencySymbol = curSym(trip?.settings?.currency || "USD");

  // Акцент текущего дня — hero перекликается с дашбордом
  const accent = useMemo(() => {
    if (!trip) return "#f97316";
    return trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.accentColor || "#f97316";
  }, [trip]);

  const events = useMemo<TimelineEvent[]>(() => {
    if (!trip) return [];
    const evts: TimelineEvent[] = [];
    const photoList = Array.isArray(photos) ? photos : [];
    const expenseList = Array.isArray(expenses) ? expenses : [];
    const journalList = Array.isArray(journals) ? journals : [];

    trip.days.forEach((day) => {
      day.places.forEach((p) => {
        if (p.status === "visited") {
          const meta = CATEGORY_META[p.category];
          evts.push({
            id: `place-${p.id}`,
            type: "place",
            timestamp: p.visitedAt || day.date,
            title: p.name,
            subtitle: p.description?.slice(0, 90),
            meta: day.city,
            icon: MapPin,
            color: meta?.color ?? "#f97316",
            emoji: meta?.emoji ?? "📍",
            targetTab: "itinerary",
            dayNumber: day.dayNumber,
            plannedDay: day.dayNumber,
            categoryLabel: meta?.label,
            fullText: p.description,
            address: p.address,
          });
        }
      });
    });

    photoList.forEach((p: Photo) => {
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
        dayNumber: p.day?.dayNumber,
        actor: p.user ? { name: p.user.name, emoji: p.user.emoji, color: p.user.color } : undefined,
        address: p.address,
      });
    });

    expenseList.forEach((e) => {
      if (e.category === "settlement") return;
      const cat = EXPENSE_CATEGORIES[e.category];
      evts.push({
        id: `expense-${e.id}`,
        type: "expense",
        timestamp: e.createdAt,
        title: e.description,
        subtitle: `${currencySymbol}${e.amount.toFixed(2)}`,
        meta: e.paidBy?.name,
        icon: Wallet,
        color: "#10b981",
        emoji: cat?.emoji ?? "💸",
        targetTab: "budget",
        dayNumber: e.day?.dayNumber,
        actor: e.paidBy ? { name: e.paidBy.name, emoji: e.paidBy.emoji, color: e.paidBy.color } : undefined,
        categoryLabel: cat?.label,
        amount: e.amount,
        originalAmount: e.originalAmount,
        originalCurrency: e.originalCurrency,
      });
    });

    journalList.forEach((j) => {
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
        dayNumber: j.day?.dayNumber,
        actor: j.user ? { name: j.user.name, emoji: j.user.emoji, color: j.user.color } : undefined,
        fullText: j.content,
        mood: j.mood,
      });
    });

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

  const stats = useMemo(
    () => ({
      place: events.filter((e) => e.type === "place").length,
      photo: events.filter((e) => e.type === "photo").length,
      expense: events.filter((e) => e.type === "expense").length,
      journal: events.filter((e) => e.type === "journal").length,
    }),
    [events]
  );

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((e) => e.type === filter);
  }, [events, filter]);

  const displayed = useMemo(
    () => (showAll ? filtered : filtered.slice(0, MAX_EVENTS)),
    [filtered, showAll]
  );

  const groups = useMemo<DayGroup[]>(() => {
    const todayKey = localIso(new Date());
    const yKey = localIso(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const map = new Map<string, DayGroup>();
    displayed.forEach((e) => {
      const date = new Date(e.timestamp);
      if (isNaN(date.getTime())) return;
      const key = localIso(date);
      let g = map.get(key);
      if (!g) {
        const year = date.getFullYear();
        const label =
          date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) +
          (year !== new Date().getFullYear() ? ` ${year}` : "");
        g = {
          key,
          label,
          weekday: date.toLocaleDateString("ru-RU", { weekday: "long" }),
          dayNo: null,
          isToday: key === todayKey,
          isYesterday: key === yKey,
          counts: { place: 0, photo: 0, expense: 0, journal: 0 },
          spent: 0,
          events: [],
        };
        map.set(key, g);
      }
      g.events.push(e);
      g.counts[e.type] += 1;
      if (e.type === "expense" && e.amount) g.spent += e.amount;
    });
    return Array.from(map.values());
  }, [displayed]);

  // Привязка календарного дня к «Дню N» поездки — по дате из trip.days
  const dayByDate = useMemo(() => {
    const m = new Map<string, Day>();
    trip?.days.forEach((d) => {
      const k = (d.date || "").slice(0, 10);
      if (k) m.set(k, d);
    });
    return m;
  }, [trip]);

  const newest = events[0];
  const fresh = newest ? Date.now() - new Date(newest.timestamp).getTime() < 24 * 60 * 60 * 1000 : false;
  const todayCount = useMemo(() => {
    const todayKey = localIso(new Date());
    return events.filter((e) => {
      const d = new Date(e.timestamp);
      return !isNaN(d.getTime()) && localIso(d) === todayKey;
    }).length;
  }, [events]);

  const loading = tripLoading || expensesLoading || photosLoading || journalsLoading;

  const jump = (e: TimelineEvent) => {
    if (e.dayNumber != null) setSelectedDay(e.dayNumber);
    setActiveTab(e.targetTab);
  };

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">📰</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Создай или присоединись к поездке</p>
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
          >
            На главную →
          </button>
        </div>
      </div>
    );
  }

  if (tripError) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-red-500/10 border border-red-500/20 text-center space-y-2">
          <div className="text-5xl mb-1">⚠️</div>
          <h1 className="text-lg font-bold">Не удалось загрузить</h1>
          <p className="text-muted-foreground text-sm">Проверь подключение и попробуй снова</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 inline-flex text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-up pb-20" aria-label="Загрузка ленты">
        <div className="h-44 rounded-3xl bg-muted animate-pulse" />
        <div className="h-16 rounded-xl bg-muted animate-pulse" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const heroTitle =
    events.length === 0
      ? "Хроника начнётся здесь"
      : todayCount > 0
        ? `${todayCount} ${plural(todayCount, "действие", "действия", "действий")} сегодня`
        : "Хроника действий";

  const compositionLine = (g: DayGroup) => {
    const parts: string[] = [];
    if (g.counts.place) parts.push(`📍 ${g.counts.place}`);
    if (g.counts.photo) parts.push(`📸 ${g.counts.photo}`);
    if (g.spent) parts.push(`💸 ${currencySymbol}${g.spent.toFixed(g.spent % 1 === 0 ? 0 : 2)}`);
    if (g.counts.journal) parts.push(`📔 ${g.counts.journal}`);
    return parts.join(" · ");
  };

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero: живой статус + фильтры-пилюли в одном блоке */}
      <section
        className="rounded-3xl p-5 text-white shadow-xl relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${accent} 0%, #1c1917 100%)` }}
      >
        <div className="absolute -bottom-10 -right-6 size-36 rounded-full opacity-10 blur-2xl bg-white" aria-hidden="true" />
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-xs mb-2">
            {fresh && !reduceMotion && (
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inline-flex size-full rounded-full bg-emerald-300 opacity-75 animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-300" />
              </span>
            )}
            {fresh && reduceMotion && <span className="size-2 rounded-full bg-emerald-300" aria-hidden="true" />}
            <Rss className="size-3.5" />
            <span>Лента поездки</span>
            <span className="ml-auto text-white/60">
              {events.length} {plural(events.length, "действие", "действия", "действий")}
            </span>
          </div>

          <h1 className="text-2xl font-bold leading-tight">{heroTitle}</h1>

          {/* Последнее действие — тап открывает детали */}
          {newest && (
            <button
              type="button"
              onClick={() => setSheetEvent(newest)}
              className="mt-2 w-full min-h-11 flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-left transition-colors active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <span
                className="size-6 rounded-full grid place-items-center text-[11px] shrink-0"
                style={{ background: `${newest.actor?.color ?? newest.color}44` }}
                aria-hidden="true"
              >
                {newest.actor?.emoji ?? newest.emoji}
              </span>
              <span className="text-xs text-white/90 truncate">
                <span className="text-white/60">Последнее:</span>{" "}
                {newest.actor && (
                  <>
                    <span className="font-medium">{newest.actor.name}</span> ·{" "}
                  </>
                )}
                {newest.title} · {relTime(newest.timestamp)}
              </span>
              <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          )}

          {/* Фильтры: тап по активной пилюле возвращает «Все» */}
          <div className="mt-3 grid grid-cols-5 gap-1.5" role="group" aria-label="Фильтр действий">
            {FILTERS.map((f) => {
              const count = f.key === "all" ? events.length : stats[f.key];
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setFilter(active && f.key !== "all" ? "all" : f.key);
                    setShowAll(false);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 min-h-11 transition-colors active:scale-95 focus-visible:ring-2 focus-visible:ring-white/60",
                    active ? "bg-white text-stone-900 font-bold shadow" : "bg-white/15 hover:bg-white/25 text-white/90"
                  )}
                >
                  <span className="text-sm leading-none" aria-hidden="true">{f.emoji}</span>
                  <span className="text-[13px] leading-none tabular-nums">{count}</span>
                  <span className="text-[9px] leading-none opacity-80">{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {groups.length === 0 ? (
        /* Пусто: разный текст для «совсем пусто» и «пусто в фильтре» */
        <div className="rounded-2xl border-2 border-dashed border-border py-12 px-4 text-center">
          {events.length === 0 || filter === "all" ? (
            <>
              <div className="text-4xl mb-3 opacity-50">📭</div>
              <p className="text-sm font-semibold">Хроника пока пуста</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Отметьте посещённое место, добавьте фото или трату — действие сразу попадёт в ленту
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {(
                  [
                    ["itinerary", MapPin, "Маршрут"],
                    ["gallery", Images, "Галерея"],
                    ["budget", Wallet, "Бюджет"],
                    ["journal", BookOpen, "Дневник"],
                  ] as const
                ).map(([tab, Icon, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className="rounded-lg bg-secondary border border-border px-3 min-h-11 text-xs font-medium hover:bg-accent transition-colors active:scale-95 flex items-center gap-1"
                  >
                    <Icon className="size-3" /> {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="text-4xl mb-3 opacity-50">{FILTERS.find((f) => f.key === filter)?.emoji}</div>
              <p className="text-sm font-semibold">{TYPE_META[filter as EventType].emptyTitle}</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">{TYPE_META[filter as EventType].emptyHint}</p>
              <button
                type="button"
                onClick={() => {
                  const ev = events.find((e) => e.type === filter);
                  if (ev) jump(ev);
                  else
                    setActiveTab(
                      ({ place: "itinerary", photo: "gallery", expense: "budget", journal: "journal" } as Record<EventType, TripTab>)[
                        filter as EventType
                      ]
                    );
                }}
                className="inline-flex items-center gap-1 rounded-xl bg-primary text-primary-foreground px-4 min-h-11 text-xs font-medium active:scale-95 transition-transform"
              >
                {TYPE_META[filter as EventType].cta} <ChevronRight className="size-3.5" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const tripDay = dayByDate.get(g.key);
            const dayNo = tripDay?.dayNumber ?? null;
            const comp = compositionLine(g);
            return (
              <div key={g.key}>
                {/* Заголовок-«талон»: День N · Сегодня/Вчера · дата · состав дня */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {dayNo != null && (
                    <span className="px-1.5 py-0.5 rounded-md border border-primary/30 bg-primary/5 text-primary font-mono text-[10px] font-semibold tracking-wide">
                      День {dayNo}
                    </span>
                  )}
                  <span className="text-sm font-bold">{g.isToday ? "Сегодня" : g.isYesterday ? "Вчера" : g.label}</span>
                  {!g.isToday && !g.isYesterday && (
                    <span className="text-xs text-muted-foreground capitalize">{g.weekday}</span>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {g.events.length} {plural(g.events.length, "действие", "действия", "действий")}
                  </span>
                </div>
                {comp && <div className="text-[11px] text-muted-foreground mb-2">{comp}</div>}

                <div className="relative pl-4 ml-3 border-l-2 border-border space-y-2">
                  {g.events.map((e, idx) => {
                    const Icon = e.icon;
                    const isNewest = e.id === newest?.id;
                    return (
                      <motion.button
                        key={e.id}
                        type="button"
                        onClick={() => setSheetEvent(e)}
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.24) }}
                        className="relative block w-full text-left active:scale-[0.98] transition-transform focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
                      >
                        <span className="absolute -left-[22px] top-2.5 z-10" aria-hidden="true">
                          {isNewest && fresh && !reduceMotion && (
                            <span className="absolute -inset-1 rounded-full bg-current opacity-20 animate-ping" style={{ color: e.color }} />
                          )}
                          <span
                            className={cn("block size-3 rounded-full border-2 border-background relative", isNewest && fresh && "size-3.5")}
                            style={{ background: e.color }}
                          />
                        </span>
                        <div className="rounded-xl bg-card border border-border p-3 card-hover w-full">
                          <div className="flex items-start gap-2.5">
                            {/* Аватар автора действия (или категории места) */}
                            <span
                              className="size-9 rounded-full grid place-items-center text-sm shrink-0 border border-black/5"
                              style={{ background: `${e.actor?.color ?? e.color}22` }}
                              aria-hidden="true"
                            >
                              {e.actor?.emoji ?? e.emoji ?? <Icon className="size-4" style={{ color: e.color }} />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-medium leading-tight line-clamp-2">{e.title}</span>
                                {e.type === "expense" && (
                                  <span className="text-sm font-bold text-emerald-600 shrink-0 tabular-nums">
                                    {currencySymbol}
                                    {e.amount?.toFixed(2)}
                                  </span>
                                )}
                              </div>
                              {e.subtitle && e.type !== "expense" && (
                                <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.subtitle}</span>
                              )}
                              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1 flex-wrap">
                                {e.actor ? (
                                  <span className="font-medium text-foreground/70">{e.actor.name}</span>
                                ) : (
                                  <span className="font-medium text-foreground/70">{e.meta}</span>
                                )}
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">{relTime(e.timestamp)}</span>
                                {e.type === "expense" && e.originalAmount && e.originalCurrency && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="tabular-nums">
                                      {e.originalAmount} {e.originalCurrency}
                                    </span>
                                  </>
                                )}
                              </span>
                            </div>
                            {e.type === "photo" && e.photoThumb ? (
                              <img
                                src={e.photoThumb}
                                alt={e.title || "Фото"}
                                className="size-12 rounded-lg object-cover shrink-0"
                                loading="lazy"
                              />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0 opacity-40 mt-1" aria-hidden="true" />
                            )}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!showAll && filtered.length > MAX_EVENTS && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full rounded-xl border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors active:scale-95 min-h-11"
            >
              Показать ещё {filtered.length - MAX_EVENTS}{" "}
              {plural(filtered.length - MAX_EVENTS, "действие", "действия", "действий")}
            </button>
          )}
        </div>
      )}

      {/* Диалог деталей: полный контекст действия + переход к разделу */}
      <MobileBottomSheet
        open={!!sheetEvent}
        onOpenChange={(v) => !v && setSheetEvent(null)}
        title={sheetEvent ? TYPE_META[sheetEvent.type].sheetTitle : ""}
        titleIcon={sheetEvent ? <span aria-hidden="true">{sheetEvent.emoji}</span> : undefined}
      >
        {sheetEvent && <EventSheet event={sheetEvent} currencySymbol={currencySymbol} onJump={() => { const ev = sheetEvent; setSheetEvent(null); jump(ev); }} />}
      </MobileBottomSheet>
    </div>
  );
}

function EventSheet({
  event: e,
  currencySymbol,
  onJump,
}: {
  event: TimelineEvent;
  currencySymbol: string;
  onJump: () => void;
}) {
  const full = new Date(e.timestamp);
  const dateStr = isNaN(full.getTime())
    ? "—"
    : full.toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const Icon = e.icon;

  return (
    <div className="space-y-4">
      {/* Автор и время действия */}
      <div className="flex items-center gap-2.5">
        <span
          className="size-10 rounded-full grid place-items-center text-base shrink-0 border border-black/5"
          style={{ background: `${e.actor?.color ?? e.color}22` }}
          aria-hidden="true"
        >
          {e.actor?.emoji ?? e.emoji ?? <Icon className="size-5" style={{ color: e.color }} />}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{e.actor?.name ?? e.meta ?? TYPE_META[e.type].sheetTitle}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{dateStr}</div>
        </div>
      </div>

      {e.type === "photo" && e.photoUrl && (
        <img src={e.photoUrl} alt={e.title || "Фото"} className="w-full rounded-2xl border border-border" />
      )}

      {e.type === "expense" ? (
        <div className="rounded-2xl bg-muted/50 border border-border p-4">
          <div className="text-3xl font-bold text-emerald-600 tabular-nums">
            {currencySymbol}
            {e.amount?.toFixed(2)}
          </div>
          {e.originalAmount && e.originalCurrency && (
            <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {e.originalAmount} {e.originalCurrency} в оригинале
            </div>
          )}
          {e.categoryLabel && <div className="text-xs text-muted-foreground mt-2">{e.categoryLabel}</div>}
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-lg font-bold leading-snug">{e.title}</h3>
          {e.categoryLabel && <div className="text-xs text-muted-foreground">{e.categoryLabel}</div>}
          {e.plannedDay != null && (
            <div className="text-xs text-muted-foreground">
              {e.plannedDay}-й день маршрута{e.meta ? ` · ${e.meta}` : ""}
            </div>
          )}
          {e.mood && <div className="text-sm">Настроение: {e.mood}</div>}
          {e.fullText && <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">{e.fullText}</p>}
          {e.address && <div className="text-xs text-muted-foreground">📍 {e.address}</div>}
        </div>
      )}

      <button
        type="button"
        onClick={onJump}
        className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {TYPE_META[e.type].cta} <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
