"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Ban,
  BookOpen,
  ChevronRight,
  Loader2,
  MapPin,
  Pencil,
  PenLine,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { dayDateFor } from "@/lib/trip-days";
import { MOODS, MOOD_META, isValidMood } from "@/lib/moods";
import { useTripStore } from "@/lib/trip-store";
import type { JournalEntry, TripDay, TripSummary } from "@/lib/types";
import {
  useJournal,
  useAddJournal,
  useEditJournal,
  useDeleteJournal,
  useTrip,
  useCurrentTripId,
} from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { MobileBottomSheet } from "./mobile-bottom-sheet";

/* Человеческое время: «2 ч назад», «вчера, 18:40», «пн, 09:15», «12 авг» */
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

function fullDate(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

/* Промпты против чистого листа: тап подставляет начало фразы в пустую запись */
const PROMPTS = [
  { emoji: "✨", label: "Удивило", starter: "Удивило: " },
  { emoji: "🍜", label: "Вкус дня", starter: "Вкус дня: " },
  { emoji: "💬", label: "Фраза", starter: "Новая фраза: " },
  { emoji: "😹", label: "Курьёз", starter: "Курьёз: " },
  { emoji: "🧭", label: "Дорога", starter: "Дорога: " },
] as const;

const MAX_MOOD_TILES = 40;

export function Journal() {
  const tripId = useCurrentTripId();
  const { data: entries, isLoading, error: entriesError, refetch: refetchEntries } = useJournal();
  const { data: trip, error: tripError, isLoading: tripLoading, refetch: refetchTrip } = useTrip();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const add = useAddJournal();
  const editEntry = useEditJournal();
  const del = useDeleteJournal();
  const { setActiveTab, setTripSwitcherOpen } = useTripStore();
  const reduceMotion = useReducedMotion();
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const restoringRef = useRef(false);

  // Композер
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string>("😊");
  const [dayId, setDayId] = useState("");
  const [placeholder, setPlaceholder] = useState(`Что запомнилось сегодня?`);
  // Фильтры
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [moodFilter, setMoodFilter] = useState<string | null>(null);
  // Шторка записи
  const [sheetId, setSheetId] = useState<string | null>(null);
  // Порционный рендер глав (аудит 2026-09-13): длинный дневник не маунтим целиком
  const [dayGroupLimit, setDayGroupLimit] = useState(5);

  /* Черновик живёт в localStorage по поездке. При смене поездки состояние
     сбрасываем (не early-return): иначе текст из поездки A уедет в черновик B */
  const draftKey = tripId ? `tt-journal-draft-${tripId}` : null;
  useEffect(() => {
    if (!draftKey) return;
    let d: { content?: string; mood?: string } = {};
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) d = JSON.parse(raw);
    } catch {
      /* битый черновик игнорируем */
    }
    setContent(d.content ?? "");
    setMood(d.mood && isValidMood(d.mood) ? d.mood : "😊");
    setAuthorFilter("all");
    setMoodFilter(null);
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey) return;
    try {
      if (content.trim()) localStorage.setItem(draftKey, JSON.stringify({ content, mood }));
      else localStorage.removeItem(draftKey);
    } catch {
      /* нет localStorage — не страшно */
    }
  }, [content, mood, draftKey]);

  /* Промпт дня — случайный после монтирования (без SSR-рассинхрона) */
  useEffect(() => {
    setPlaceholder(`${PROMPTS[Math.floor(Math.random() * PROMPTS.length)].starter}…`);
  }, []);

  /* Дефолтный день — «сегодня», при отсутствии — последний */
  useEffect(() => {
    if (!trip?.days?.length) return;
    if (dayId && trip.days.some((d) => d.id === dayId)) return;
    const cur =
      trip.days.find((d) => d.dayNumber === trip.currentDayNumber) ?? trip.days[trip.days.length - 1];
    setDayId(cur?.id ?? "");
  }, [trip, dayId]);

  /* Сброс авторегровай высоты после очистки */
  useEffect(() => {
    if (!content && taRef.current) taRef.current.style.height = "";
  }, [content]);

  const hasDays = !!trip?.days.length;

  const authors = useMemo(() => {
    const list = entries ?? [];
    return Array.from(new Set(list.map((e) => e.userId).filter(Boolean) as string[])).map((uid) => {
      const entry = list.find((e) => e.userId === uid);
      return {
        id: uid,
        name: entry?.user?.name || "Гость",
        emoji: entry?.user?.emoji || "👤",
        color: entry?.user?.color || "#94a3b8",
      };
    });
  }, [entries]);

  /* Пульс настроения: хронология эмоций поездки, тап — фильтр ленты */
  const moodTimeline = useMemo(() => {
    const list = (entries ?? []).filter((e) => e.mood && isValidMood(e.mood));
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return list;
  }, [entries]);

  const filteredEntries = useMemo(() => {
    let list = entries ?? [];
    if (authorFilter !== "all") list = list.filter((e) => e.userId === authorFilter);
    if (moodFilter) list = list.filter((e) => e.mood === moodFilter);
    return list;
  }, [entries, authorFilter, moodFilter]);

  /* Главы: дни поездки с записями, по порядку дней */
  const grouped = useMemo(() => {
    if (!trip) return [];
    return trip.days
      .map((d) => ({ day: d, list: filteredEntries.filter((e) => e.dayId === d.id) }))
      .filter((g) => g.list.length > 0);
  }, [trip, filteredEntries]);

  const stats = useMemo(() => {
    const list = entries ?? [];
    const todayKey = new Date().toDateString();
    return {
      total: list.length,
      today: list.filter((e) => new Date(e.createdAt).toDateString() === todayKey).length,
      documentedDays: new Set(list.map((e) => e.dayId)).size,
      last: list[0],
    };
  }, [entries]);

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">📔</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Создай или выбери поездку</p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (tripError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <button
          type="button"
          onClick={() => refetchTrip()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }
  if (entriesError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">📔</div>
        <p className="text-sm font-medium">Не удалось загрузить дневник</p>
        <button
          type="button"
          onClick={() => refetchEntries()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }
  if (isLoading || tripLoading || !trip) {
    return <JournalSkeleton />;
  }

  const isOwnerRole = trip.participants.find((p) => p.id === currentUserId)?.role === "owner";
  const totalDays = trip.days.length;
  const documentedPct = totalDays > 0 ? Math.min(100, Math.round((stats.documentedDays / totalDays) * 100)) : 0;

  const dayDateLabel = (dayNumber: number) => {
    try {
      return dayDateFor(new Date(trip.settings.startDate), dayNumber).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      });
    } catch {
      return "";
    }
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  const applyPrompt = (starter: string) => {
    if (!content.trim()) setContent(starter);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  const submit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("Напишите что-нибудь");
      return;
    }
    if (trimmed.length > 5000) {
      toast.error("Слишком длинная запись (макс 5000 символов)");
      return;
    }
    if (!hasDays) {
      toast.error("Сначала создайте день в Маршруте");
      return;
    }
    const targetDay = dayId || trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id;
    if (!targetDay) {
      toast.error("Выберите день");
      return;
    }
    const safeMood = mood && isValidMood(mood) ? mood : undefined;
    try {
      await add.mutateAsync({ dayId: targetDay, content: trimmed, mood: safeMood, userId: currentUserId });
      toast.success("Записано 📔");
      setContent("");
      setMood("😊");
      setAuthorFilter("all");
      setMoodFilter(null);
      // показать свежую запись: дневник скроллится к главе этого дня
      requestAnimationFrame(() => {
        document
          .getElementById(`journal-day-${targetDay}`)
          ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
    } catch (err) {
      toast.error("Не удалось добавить запись", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
      // текст не чистим при ошибке — черновик остаётся на месте
    }
  };

  const sheetEntry = sheetId ? (entries ?? []).find((e) => e.id === sheetId) ?? null : null;

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* ── Hero: состояние дневника + пульс настроения ── */}
      <section
        className="rounded-3xl p-5 text-white shadow-xl relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #1c1917 100%)" }}
      >
        <div className="absolute -bottom-10 -right-6 size-36 rounded-full opacity-10 blur-2xl bg-white" aria-hidden="true" />
        <div className="relative">
          <div className="flex items-center gap-2 text-white/70 text-[11px] font-medium uppercase tracking-wide">
            <BookOpen className="size-3.5" />
            <span>Дневник</span>
            <span className="ml-auto normal-case tracking-normal tabular-nums">
              {stats.documentedDays}/{totalDays} {plural(totalDays, "день", "дня", "дней")}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold leading-tight mt-1">
            {stats.total === 0
              ? "Первая страница ждёт"
              : stats.today > 0
                ? `${stats.today} ${plural(stats.today, "запись", "записи", "записей")} сегодня`
                : "Хроника дней"}
          </h1>
          <p className="text-white/75 text-xs sm:text-sm mt-0.5">
            {stats.total} {plural(stats.total, "запись", "записи", "записей")}
            {authors.length > 1 && <span className="text-white/55"> · {authors.length} авторов</span>}
            {stats.last && <span className="text-white/55"> · последняя {relTime(stats.last.createdAt)}</span>}
          </p>

          {/* Сколько поездки уже описано */}
          <div className="mt-3 h-1.5 rounded-full bg-white/20 overflow-hidden" aria-hidden="true">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${documentedPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-white"
            />
          </div>

          {/* Пульс настроения — тап по эмодзи фильтрует ленту */}
          {moodTimeline.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1.5">
                Пульс настроения · тап — фильтр
              </div>
              <div className="flex flex-wrap gap-1">
                {moodTimeline.slice(0, MAX_MOOD_TILES).map((e) => {
                  const active = moodFilter === e.mood;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setMoodFilter(active ? null : (e.mood as string))}
                      aria-pressed={active}
                      title={MOOD_META[e.mood as keyof typeof MOOD_META]?.label}
                      className={cn(
                        "size-8 rounded-lg text-base grid place-items-center transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-white/60",
                        active ? "bg-white text-stone-900 scale-110 shadow" : "bg-white/15 hover:bg-white/25"
                      )}
                    >
                      {e.mood}
                    </button>
                  );
                })}
                {moodTimeline.length > MAX_MOOD_TILES && (
                  <span className="size-8 rounded-lg grid place-items-center text-[10px] text-white/60">
                    +{moodTimeline.length - MAX_MOOD_TILES}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Композер ── */}
      {hasDays ? (
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PenLine className="size-3.5" />
            <span>Новая запись</span>
            <span
              className={cn("ml-auto tabular-nums", content.length > 4500 && "text-destructive")}
            >
              {content.length}/5000
            </span>
          </div>

          <textarea
            ref={taRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              autoGrow(e.target);
            }}
            placeholder={placeholder}
            rows={3}
            maxLength={5000}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm resize-none leading-relaxed"
          />

          {/* Промпты видны только на чистом листе */}
          {!content.trim() && (
            <div className="chip-rail no-scrollbar -mx-1 px-1">
              {PROMPTS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPrompt(p.starter)}
                  className="min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap bg-muted hover:bg-accent transition-colors active:scale-95"
                >
                  <span aria-hidden="true">{p.emoji}</span> {p.label}
                </button>
              ))}
            </div>
          )}

          <MoodRail value={mood} onChange={(m) => setMood(m ?? "😊")} />
          <DayChips days={trip.days} value={dayId} onChange={setDayId} currentDayNumber={trip.currentDayNumber} />

          <button
            type="button"
            onClick={submit}
            disabled={add.isPending || !content.trim()}
            className="w-full min-h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-md disabled:opacity-50 active:scale-[0.99] transition-all"
          >
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Записать в дневник
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-card border border-border text-center py-6 space-y-2">
          <div className="text-3xl">🗺️</div>
          <p className="text-sm font-medium">Сначала создайте день в Маршруте</p>
          <p className="text-xs text-muted-foreground px-6">
            Записи в дневнике привязаны к дням поездки — так дневник складывается в историю
          </p>
          <button
            type="button"
            onClick={() => setActiveTab("itinerary")}
            className="mt-2 inline-flex items-center gap-1.5 text-xs px-4 min-h-11 rounded-lg bg-primary text-primary-foreground active:scale-95 transition-transform"
          >
            <MapPin className="size-3.5" /> Перейти в Маршрут
          </button>
        </div>
      )}

      {/* ── Фильтры: активное настроение + авторы ── */}
      {(moodFilter || authors.length > 1) && (
        <div className="chip-rail no-scrollbar -mx-1 px-1">
          {moodFilter && (
            <button
              type="button"
              onClick={() => setMoodFilter(null)}
              aria-label="Сбросить фильтр настроения"
              className="min-h-11 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap bg-primary text-primary-foreground active:scale-95 transition-transform"
            >
              <span aria-hidden="true">{moodFilter}</span>
              {MOOD_META[moodFilter as keyof typeof MOOD_META]?.label ?? "настроение"}
              <span aria-hidden="true">✕</span>
            </button>
          )}
          {authors.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setAuthorFilter("all")}
                aria-pressed={authorFilter === "all"}
                className={cn(
                  "min-h-11 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95",
                  authorFilter === "all" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
                )}
              >
                Все ({stats.total})
              </button>
              {authors.map((a) => {
                const count = (entries ?? []).filter((e) => e.userId === a.id).length;
                const active = authorFilter === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAuthorFilter(active ? "all" : a.id)}
                    aria-pressed={active}
                    className={cn(
                      "min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95",
                      active ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
                    )}
                  >
                    <span
                      className="size-4 rounded-full grid place-items-center text-[9px]"
                      style={{ background: a.color }}
                      aria-hidden="true"
                    >
                      {a.emoji}
                    </span>
                    {a.id === currentUserId ? "Вы" : a.name}
                    <span className="opacity-70 tabular-nums">({count})</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── Лента: главы по дням ── */}
      {grouped.length === 0 ? (
        hasDays &&
        (stats.total === 0 || moodFilter || authorFilter !== "all" ? (
          <div className="rounded-2xl border-2 border-dashed border-border py-12 px-4 text-center">
            <BookOpen className="size-10 mx-auto text-muted-foreground/50 mb-3" />
            {stats.total === 0 ? (
              <>
                <p className="text-sm font-semibold">Дневник пуст</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Одна строчка в день — и поездка останется книгой, а не списком фотографий
                </p>
                <button
                  type="button"
                  onClick={() => taRef.current?.focus()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 min-h-11 text-xs font-medium active:scale-95 transition-transform"
                >
                  <PenLine className="size-3.5" /> Написать первую запись
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Под фильтр ничего не попало</p>
                <button
                  type="button"
                  onClick={() => {
                    setMoodFilter(null);
                    setAuthorFilter("all");
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-secondary border border-border px-4 min-h-11 text-xs font-medium active:scale-95 transition-transform"
                >
                  Сбросить фильтры
                </button>
              </>
            )}
          </div>
        ) : null)
      ) : (
        <div className="space-y-5">
          {grouped.slice(0, dayGroupLimit).map(({ day, list }) => (
            <div key={day.id} id={`journal-day-${day.id}`} className="scroll-mt-[110px]">
              {/* Заголовок главы — прилипает под шапкой */}
              <div className="sticky sticky-under-shell z-10 -mx-1 px-1 py-1.5 mb-1 bg-background/85 backdrop-blur-sm rounded-xl flex items-center gap-2">
                <div
                  className="size-7 rounded-lg grid place-items-center text-white text-xs font-bold font-mono shrink-0 shadow-sm"
                  style={{ background: day.accentColor ?? "#8b5cf6" }}
                >
                  {day.dayNumber}
                </div>
                <div className="text-sm font-bold whitespace-nowrap">День {day.dayNumber}</div>
                <div className="text-xs text-muted-foreground truncate min-w-0">{day.city}</div>
                <div className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                  {dayDateLabel(day.dayNumber)} · {list.length}
                </div>
              </div>

              <div className="space-y-2 pl-9">
                <AnimatePresence initial={false}>
                  {list.map((e) => {
                    const author = e.user;
                    const isOwn = e.userId === currentUserId;
                    const isEdited =
                      e.updatedAt &&
                      new Date(e.updatedAt).getTime() - new Date(e.createdAt).getTime() > 60_000;
                    return (
                      <motion.button
                        key={e.id}
                        type="button"
                        onClick={() => setSheetId(e.id)}
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0, x: -20 }}
                        className="relative block w-full text-left rounded-2xl bg-card border border-border p-3 card-hover active:scale-[0.99] transition-transform focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {/* точка автора на нити */}
                        <span
                          className="absolute -left-7 top-3 size-3 rounded-full border-2 border-background"
                          style={{ background: author?.color ?? "#94a3b8" }}
                          aria-hidden="true"
                        />
                        <div className="flex items-start gap-2.5">
                          {e.mood ? (
                            <span
                              className="size-10 rounded-xl bg-muted grid place-items-center text-xl shrink-0"
                              aria-hidden="true"
                            >
                              {e.mood}
                            </span>
                          ) : (
                            <span
                              className="size-10 rounded-xl grid place-items-center text-base shrink-0 border border-black/5"
                              style={{ background: `${author?.color ?? "#94a3b8"}22` }}
                              aria-hidden="true"
                            >
                              {author?.emoji ?? "📔"}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words line-clamp-4">
                              {e.content}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                              {author && (
                                <span className="flex items-center gap-1">
                                  <span
                                    className="size-3 rounded-full grid place-items-center text-[8px]"
                                    style={{ background: author.color }}
                                    aria-hidden="true"
                                  >
                                    {author.emoji}
                                  </span>
                                  <span className="font-medium text-foreground/70">
                                    {isOwn ? "Вы" : author.name}
                                  </span>
                                </span>
                              )}
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{relTime(e.createdAt)}</span>
                              {isEdited && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>изменено</span>
                                </>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="size-3.5 shrink-0 opacity-30 mt-1" aria-hidden="true" />
                        </div>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          ))}
          {grouped.length > dayGroupLimit && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setDayGroupLimit((n) => n + 5)}
                className="inline-flex min-h-11 items-center rounded-xl bg-secondary border border-border px-5 text-xs font-medium active:scale-95 transition-transform"
              >
                Показать ещё дни · осталось {grouped.length - dayGroupLimit}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Шторка записи: просмотр / правка / удаление ── */}
      <MobileBottomSheet
        open={!!sheetEntry}
        onOpenChange={(v) => !v && setSheetId(null)}
        title={sheetEntry?.mood ? `${sheetEntry.mood} Запись дневника` : "Запись дневника"}
      >
        {sheetEntry && (
          <EntrySheet
            entry={sheetEntry}
            trip={trip}
            canModify={sheetEntry.userId === currentUserId || isOwnerRole}
            editMutation={editEntry}
            delMutation={del}
            onClose={() => setSheetId(null)}
            onDeleted={(snap) => {
              setSheetId(null);
              toast.success("Запись удалена", {
                description: "Можно вернуть, пока не закрылся тост",
                action: {
                  label: "Вернуть",
                  onClick: () => {
                    // sonner не дисейблит action — защита от двойного POST
                    if (restoringRef.current) return;
                    restoringRef.current = true;
                    void add
                      .mutateAsync({
                        dayId: snap.dayId,
                        content: snap.content,
                        mood: snap.mood ?? undefined,
                        userId: currentUserId,
                      })
                      .then(() => toast.success("Запись вернулась 📔"))
                      .catch(() => toast.error("Не удалось вернуть запись"))
                      .finally(() => {
                        restoringRef.current = false;
                      });
                  },
                },
                duration: 7000,
              });
            }}
          />
        )}
      </MobileBottomSheet>
    </div>
  );
}

/* ── Рельса настроений с подписью выбранного ── */
function MoodRail({
  value,
  onChange,
  allowNone = false,
}: {
  value: string;
  onChange: (mood: string | null) => void;
  allowNone?: boolean;
}) {
  const selectedLabel =
    value === "none"
      ? "без настроения"
      : MOOD_META[value as keyof typeof MOOD_META]?.label;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
        <span>Настроение</span>
        {selectedLabel && <span className="font-medium text-foreground">{selectedLabel}</span>}
      </div>
      <div className="chip-rail no-scrollbar -mx-1 px-1">
        {allowNone && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-pressed={value === "none"}
            aria-label="Без настроения"
            className={cn(
              "size-11 rounded-xl grid place-items-center transition-all active:scale-95 shrink-0",
              value === "none" || !value ? "bg-primary/15 ring-2 ring-primary text-primary" : "bg-muted text-muted-foreground"
            )}
          >
            <Ban className="size-4" />
          </button>
        )}
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={value === m}
            aria-label={`Настроение ${m} ${MOOD_META[m].label}`}
            className={cn(
              "size-11 rounded-xl text-xl grid place-items-center transition-all active:scale-95 shrink-0",
              value === m ? "bg-primary/15 ring-2 ring-primary scale-105" : "bg-muted hover:bg-accent"
            )}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Рельса дней: «сегодня» подсвечен пингом, чипы несут цвет дня ── */
function DayChips({
  days,
  value,
  onChange,
  currentDayNumber,
}: {
  days: TripDay[];
  value: string;
  onChange: (id: string) => void;
  currentDayNumber?: number;
}) {
  return (
    <div className="chip-rail no-scrollbar -mx-1 px-1">
      {days.map((d) => {
        const isToday = currentDayNumber != null && d.dayNumber === currentDayNumber;
        const active = value === d.id;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onChange(d.id)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 min-h-11 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95",
              active ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent text-foreground/80"
            )}
          >
            {isToday ? (
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
            ) : (
              <span
                className="size-2 rounded-full"
                style={{ background: d.accentColor ?? "#8b5cf6" }}
                aria-hidden="true"
              />
            )}
            День {d.dayNumber}
            {isToday && <span>· сегодня</span>}
            {d.city && <span className="opacity-60 max-w-20 truncate">{d.city}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Шторка записи: просмотр → правка/удаление ── */
function EntrySheet({
  entry,
  trip,
  canModify,
  editMutation,
  delMutation,
  onClose,
  onDeleted,
}: {
  entry: JournalEntry;
  trip: TripSummary;
  canModify: boolean;
  editMutation: ReturnType<typeof useEditJournal>;
  delMutation: ReturnType<typeof useDeleteJournal>;
  onClose: () => void;
  onDeleted: (snapshot: JournalEntry) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editContent, setEditContent] = useState(entry.content);
  const [editMood, setEditMood] = useState<string>(entry.mood ?? "none");
  const [editDayId, setEditDayId] = useState(entry.dayId);

  const day = trip.days.find((d) => d.id === entry.dayId);
  const author = entry.user;
  const authorName = author ? author.name : "Гость";

  const saveEdit = async () => {
    const trimmed = editContent.trim();
    if (!trimmed) {
      toast.error("Текст записи пуст");
      return;
    }
    try {
      await editMutation.mutateAsync({
        id: entry.id,
        content: trimmed,
        mood: editMood === "none" ? null : editMood,
        dayId: editDayId || undefined,
      });
      toast.success("Изменения сохранены ✍️");
      onClose();
    } catch (err) {
      toast.error("Не удалось сохранить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  const doDelete = async () => {
    try {
      await delMutation.mutateAsync(entry.id);
      onDeleted(entry);
    } catch (err) {
      toast.error("Не удалось удалить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  if (mode === "edit") {
    return (
      <div className="space-y-3">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={5}
          maxLength={5000}
          autoFocus
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile resize-none leading-relaxed"
        />
        <MoodRail value={editMood} onChange={(m) => setEditMood(m ?? "none")} allowNone />
        <DayChips
          days={trip.days}
          value={editDayId}
          onChange={setEditDayId}
          currentDayNumber={trip.currentDayNumber}
        />
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setMode("view")}
            className="flex-1 min-h-11 rounded-xl bg-secondary border border-border text-sm font-medium active:scale-[0.98] transition-transform"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={saveEdit}
            disabled={editMutation.isPending}
            className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {editMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Сохранить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Автор и время */}
      <div className="flex items-center gap-2.5">
        <span
          className="size-10 rounded-full grid place-items-center text-base shrink-0 border border-black/5"
          style={{ background: `${author?.color ?? "#94a3b8"}22` }}
          aria-hidden="true"
        >
          {author?.emoji ?? "👤"}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{authorName}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{fullDate(entry.createdAt)}</div>
        </div>
        {day && (
          <span className="ml-auto px-2 py-1 rounded-md border border-primary/30 bg-primary/5 text-primary font-mono text-[10px] font-semibold whitespace-nowrap">
            День {day.dayNumber} · {day.city}
          </span>
        )}
      </div>

      {entry.mood && (
        <div className="inline-flex items-center gap-2 rounded-full bg-muted/70 border border-border px-3 py-1.5">
          <span className="text-lg" aria-hidden="true">
            {entry.mood}
          </span>
          <span className="text-xs font-medium">
            {MOOD_META[entry.mood as keyof typeof MOOD_META]?.label ?? "настроение"}
          </span>
        </div>
      )}

      <p className="text-[15px] leading-relaxed whitespace-pre-line">{entry.content}</p>

      {canModify && (
        <div className="pt-1">
          {confirmDelete ? (
            <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 space-y-2.5">
              <p className="text-sm font-medium text-center">Удалить эту запись?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={delMutation.isPending}
                  className="flex-1 min-h-11 rounded-xl bg-secondary border border-border text-sm font-medium active:scale-[0.98] transition-transform"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={doDelete}
                  disabled={delMutation.isPending}
                  className="flex-1 min-h-11 rounded-xl bg-destructive text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  {delMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Удалить
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditContent(entry.content);
                  setEditMood(entry.mood ?? "none");
                  setEditDayId(entry.dayId);
                  setMode("edit");
                }}
                className="flex-1 min-h-11 rounded-xl bg-secondary border border-border text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
              >
                <Pencil className="size-4" /> Изменить
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex-1 min-h-11 rounded-xl border border-destructive/40 text-destructive bg-destructive/5 text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
              >
                <Trash2 className="size-4" /> Удалить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JournalSkeleton() {
  return (
    <div className="space-y-4 animate-fade-up pb-20" aria-label="Загрузка дневника">
      <div className="h-52 rounded-3xl bg-muted animate-pulse" />
      <div className="rounded-2xl bg-card border border-border p-4 space-y-3 animate-pulse">
        <div className="h-3 rounded bg-muted w-1/3" />
        <div className="h-16 rounded-xl bg-muted" />
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="size-11 rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-12 rounded-xl bg-muted" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="pl-9 space-y-2">
          <div className="h-8 rounded-xl bg-muted animate-pulse" />
          <div className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
        </div>
      ))}
    </div>
  );
}
