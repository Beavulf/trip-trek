"use client";

import { useAISummary, useTrip, useCurrentTripId, type AISummaryType } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Loader2,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Share2,
  History,
  Trash2,
  PenLine,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { currencySymbol } from "@/lib/currencies";
import { MobileBottomSheet } from "./mobile-bottom-sheet";

// ─── Форматы рассказа ───────────────────────────────────────────────────────

const FORMATS: Array<{
  key: AISummaryType;
  label: string;
  emoji: string;
  desc: string;
}> = [
  {
    key: "summary",
    label: "Поездка",
    emoji: "✨",
    desc: "Итог всего путешествия: дуга от старта до финала",
  },
  {
    key: "day",
    label: "День",
    emoji: "📅",
    desc: "История одного дня — прожитого или ещё впереди",
  },
  {
    key: "tips",
    label: "Советы",
    emoji: "💡",
    desc: "5 практичных советов по остатку маршрута и бюджета",
  },
];

// ─── Стили рассказа (синхронно с STYLE_PROMPTS в api/ai-summary) ────────────

type StoryStyle = "warm" | "letter" | "cinema" | "humor" | "chronicle" | "tale";

const STYLES: Array<{ key: StoryStyle; label: string; emoji: string; hint: string }> = [
  { key: "warm", label: "Тёплый рассказ", emoji: "🪄", hint: "как разговор за чаем, с живой деталью" },
  { key: "letter", label: "Письмо другу", emoji: "💌", hint: "тому, кто в этот раз не поехал" },
  { key: "cinema", label: "Трейлер", emoji: "🎬", hint: "поездка как фильм: роли и слоган" },
  { key: "humor", label: "С юмором", emoji: "😄", hint: "рекорды трат и планы vs реальность" },
  { key: "chronicle", label: "Хроника", emoji: "📰", hint: "телеграфом: цифры, факты, рекорды" },
  { key: "tale", label: "Сказка", emoji: "🧚", hint: "волшебная версия ваших событий" },
];

const styleMeta = (key: string) => STYLES.find((s) => s.key === key) ?? STYLES[0];
const formatMeta = (key: string) => FORMATS.find((f) => f.key === key) ?? FORMATS[0];

// ─── Строки-статусы на время генерации ──────────────────────────────────────

const WRITING_LINES = [
  "Перелистываем фотографии…",
  "Разливаем чай воспоминаний…",
  "Собираем разбросанные моменты…",
  "Выбираем самый яркий кадр…",
  "Считаем шаги и улыбки…",
  "Дописываем последнюю строчку…",
];

// ─── История генераций (localStorage, минимум данных) ───────────────────────

interface HistoryItem {
  id: string;
  type: AISummaryType;
  style: StoryStyle;
  dayNumber?: number;
  content: string;
  createdAt: number;
  generated: boolean;
  /** Открыт из истории (не перегенерирован только что) */
  fromHistory?: boolean;
}

const HISTORY_CAP = 12;
const historyKey = (tripId: string) => `ai-stories:${tripId}`;

function loadHistory(tripId: string): HistoryItem[] {
  try {
    const raw = localStorage.getItem(historyKey(tripId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, HISTORY_CAP) : [];
  } catch {
    return [];
  }
}

function persistHistory(tripId: string, items: HistoryItem[]) {
  try {
    localStorage.setItem(historyKey(tripId), JSON.stringify(items.slice(0, HISTORY_CAP)));
  } catch {
    /* переполнение localStorage — не критично */
  }
}

/** «2 ч назад», «вчера», «9 авг» */
function when(ts: number): string {
  const d = new Date(ts);
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)} ч назад`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "вчера";
  }
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/** Markdown → обычный текст для буфера/шеринга */
function plainText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

// ─── Компонент ──────────────────────────────────────────────────────────────

export function AISummary() {
  const tripId = useCurrentTripId();
  // key сбрасывает локальный state + mutation при смене поездки
  return <AISummaryInner key={tripId || "none"} tripId={tripId} />;
}

function AISummaryInner({ tripId }: { tripId: string }) {
  const { data: trip, error: tripError, isLoading, refetch } = useTrip();
  const { setTripSwitcherOpen } = useTripStore();
  const ai = useAISummary();
  const reduced = useReducedMotion();

  const [format, setFormat] = useState<AISummaryType | null>(null);
  const [style, setStyle] = useState<StoryStyle>("warm");
  const [dayNum, setDayNum] = useState<number | null>(null);
  const [result, setResult] = useState<HistoryItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [lineIdx, setLineIdx] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Стиль и история — из localStorage (гидрация начинается с дефолтов, потом синк)
  useEffect(() => {
    setHistory(loadHistory(tripId));
    try {
      const saved = localStorage.getItem(`ai-style:${tripId}`);
      if (saved && STYLES.some((s) => s.key === saved)) setStyle(saved as StoryStyle);
    } catch {
      /* noop */
    }
  }, [tripId]);

  const saveStyle = (s: StoryStyle) => {
    setStyle(s);
    try {
      localStorage.setItem(`ai-style:${tripId}`, s);
    } catch {
      /* noop */
    }
  };

  const days = useMemo(
    () => [...(trip?.days ?? [])].sort((a, b) => a.dayNumber - b.dayNumber),
    [trip?.days]
  );

  // Неклампнутый номер дня: currentDayNumber с сервера зажат в [1..totalDays],
  // а фазу поездки (до старта / идёт / завершена) нужно знать точно
  const dayOffset = useMemo(() => {
    if (!trip) return 1;
    const s = new Date(trip.settings.startDate);
    const startUTC = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate());
    const now = new Date();
    const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((nowUTC - startUTC) / 86400000) + 1;
  }, [trip]);

  // «Умное» предложение формата по состоянию поездки
  const suggested: AISummaryType = useMemo(() => {
    if (!trip) return "summary";
    if (dayOffset <= 0) return "tips";
    if (dayOffset > trip.settings.totalDays) return "summary";
    return "day";
  }, [trip, dayOffset]);

  // При выборе «День» — подставляем текущий день
  useEffect(() => {
    if (format === "day" && dayNum === null && trip) {
      const cur = Math.min(Math.max(trip.currentDayNumber, 1), Math.max(trip.settings.totalDays, 1));
      setDayNum(days.some((d) => d.dayNumber === cur) ? cur : (days[0]?.dayNumber ?? null));
    }
  }, [format, dayNum, trip, days]);

  // Ротация строк-статусов во время генерации
  useEffect(() => {
    if (!ai.isPending || reduced) return;
    const t = setInterval(() => setLineIdx((i) => (i + 1) % WRITING_LINES.length), 2200);
    return () => clearInterval(t);
  }, [ai.isPending, reduced]);

  const addHistory = (item: HistoryItem) => {
    setHistory((prev) => {
      const next = [{ ...item, content: item.content.slice(0, 12000) }, ...prev].slice(0, HISTORY_CAP);
      persistHistory(tripId, next);
      return next;
    });
  };

  const removeFromHistory = (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h.id !== id);
      persistHistory(tripId, next);
      return next;
    });
  };

  const write = async (forceFormat?: AISummaryType) => {
    const type = forceFormat ?? format;
    if (!tripId || !trip) {
      toast.error("Не выбрана поездка");
      return;
    }
    if (!type) {
      toast("Выберите, что рассказать");
      return;
    }
    if (type === "day" && dayNum === null) {
      toast.error("Выберите день");
      return;
    }
    setFormat(type);
    setResult(null);
    setLineIdx(0);
    try {
      const res = await ai.mutateAsync({
        type,
        style,
        dayNumber: type === "day" ? (dayNum ?? undefined) : undefined,
      });
      const item: HistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        style: (res.style as StoryStyle) || style,
        dayNumber: type === "day" ? dayNum ?? undefined : undefined,
        content: res.content,
        createdAt: Date.now(),
        generated: res.generated !== false,
      };
      setResult(item);
      addHistory(item);
      if (res.generated === false) {
        toast.info("Пока без нейросети — это черновик по данным поездки", {
          description: "Добавьте OPENAI_API_KEY на сервере для живых историй",
        });
      }
    } catch (e) {
      toast.error("Не получилось написать историю", {
        description: e instanceof Error ? e.message : "Попробуйте позже",
      });
    }
  };

  const copy = async () => {
    if (!result) return;
    const text = plainText(result.content);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Скопировано в буфер");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        toast.success("Скопировано в буфер");
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error("Не удалось скопировать", { description: "Скопируйте текст вручную" });
      }
    }
  };

  const share = async () => {
    if (!result || !trip) return;
    const text = plainText(result.content);
    const title = `${formatMeta(result.type).label} · ${trip.settings.title}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text });
        return;
      } catch {
        // пользователь отменил системный шеринг — молча
        return;
      }
    }
    copy();
  };

  // ── Состояния без поездки ──

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <Hero />
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-2">
          <div className="text-4xl">🧳</div>
          <p className="text-sm font-medium">Выберите поездку</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Соберём историю по вашим местам, дневнику и тратам
          </p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (tripError) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <Hero />
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-2">
          <div className="text-4xl">🤔</div>
          <p className="text-sm font-medium">Не удалось загрузить поездку</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            Обновить
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !trip) {
    return (
      <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Загрузка…
      </div>
    );
  }

  const sym = currencySymbol(trip.settings.currency);
  const totalDays = trip.settings.totalDays;
  const dayLabel =
    dayOffset <= 0
      ? dayOffset === 0
        ? "старт сегодня"
        : `старт через ${1 - dayOffset} ${plural(1 - dayOffset, "день", "дня", "дней")}`
      : dayOffset > totalDays
        ? "поездка завершена"
        : `день ${dayOffset} из ${totalDays}`;

  const ctaDisabled = ai.isPending || (format === "day" && dayNum === null);

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      <Hero
        tripTitle={trip.settings.title}
        stats={{
          day: dayLabel,
          places: `${trip.visitedPlaces}/${trip.totalPlaces} ${plural(trip.totalPlaces, "место", "места", "мест")}`,
          photos: trip.totalPhotos,
          journals: trip.totalJournals,
        }}
      />

      {/* ── Студия рассказа ── */}
      <div className="rounded-3xl bg-card border border-border p-4 space-y-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Что рассказать
          </p>
          <div className="grid grid-cols-3 gap-1 bg-muted rounded-2xl p-1">
            {FORMATS.map((f) => {
              const active = format === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFormat(f.key)}
                  aria-pressed={active}
                  className={cn(
                    "relative min-h-11 rounded-xl text-sm transition-all flex items-center justify-center gap-1.5",
                    active
                      ? "bg-card shadow font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span>{f.emoji}</span>
                  <span>{f.label}</span>
                  {suggested === f.key && !active && !reduced && (
                    <span className="absolute top-1 right-1.5 size-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2 px-1 min-h-8">
            {format
              ? FORMATS.find((f) => f.key === format)?.desc
              : `Нажали ✨ — будет итог поездки, 📅 — один день, 💡 — советы. Рекомендуем сейчас: ${formatMeta(suggested).label.toLowerCase()}`}
          </p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Стиль рассказа
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {STYLES.map((s) => {
              const active = style === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => saveStyle(s.key)}
                  aria-pressed={active}
                  title={s.hint}
                  className={cn(
                    "shrink-0 snap-start min-h-11 px-3.5 rounded-full border text-sm whitespace-nowrap transition-all flex items-center gap-1.5",
                    active
                      ? "border-transparent bg-gradient-to-r from-violet-600 via-fuchsia-500 to-orange-500 text-white font-semibold shadow-md shadow-fuchsia-500/20"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  <span>{s.emoji}</span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2 px-1 min-h-8">
            {styleMeta(style).emoji} {styleMeta(style).hint}
          </p>
        </div>

        <AnimatePresence initial={false}>
          {format === "day" && (
            <motion.div
              initial={reduced ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduced ? undefined : { opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Какой день
              </p>
              {days.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">
                  В этой поездке пока нет дней — добавьте их на странице маршрута
                </p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {days.map((d) => {
                    const selected = dayNum === d.dayNumber;
                    const isToday = d.dayNumber === dayOffset;
                    const future = d.dayNumber > dayOffset;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDayNum(d.dayNumber)}
                        aria-pressed={selected}
                        className={cn(
                          "shrink-0 snap-start min-h-11 px-3 rounded-xl border text-left transition-all",
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:border-primary/40",
                          future && !selected && "border-dashed"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold leading-tight">Д{d.dayNumber}</span>
                          {isToday && (
                            <span className="size-1.5 rounded-full bg-green-500" aria-label="сегодня" />
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground leading-tight max-w-16 truncate">
                          {d.city || "—"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => write()}
          disabled={ctaDisabled}
          className="w-full min-h-12 rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-orange-500 text-white font-semibold text-sm shadow-lg shadow-fuchsia-500/20 flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
        >
          {ai.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Пишем…
            </>
          ) : (
            <>
              <PenLine className="size-4" /> Написать историю
            </>
          )}
        </button>
      </div>

      {/* ── Генерация: строки писателя + скелет ── */}
      <AnimatePresence>
        {ai.isPending && !result && (
          <motion.div
            key="pending"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            className="rounded-2xl bg-card border border-border p-5 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 animate-ping" />
                <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
              </span>
              {reduced ? "Пишем историю…" : WRITING_LINES[lineIdx]}
            </div>
            <div className="space-y-2" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  animate={reduced ? undefined : { opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                  className="h-3 bg-muted rounded"
                  style={{ width: `${100 - i * 15}%` }}
                />
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Обычно занимает 10–30 секунд · не закрывайте страницу
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Результат: открытка с печатью рассказчика ── */}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={result.id}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            className="relative"
          >
            {/* Печать стиля */}
            <motion.div
              initial={reduced ? false : { scale: 2.4, opacity: 0, rotate: 10 }}
              animate={{ scale: 1, opacity: 1, rotate: -12 }}
              transition={reduced ? undefined : { type: "spring", stiffness: 320, damping: 16, delay: 0.3 }}
              className="absolute -top-3.5 right-4 z-10 size-14 rounded-full border-2 border-dashed border-fuchsia-500/60 bg-background/90 backdrop-blur grid place-items-center shadow-sm"
              aria-hidden
            >
              <span className="text-xl leading-none select-none">{styleMeta(result.style).emoji}</span>
            </motion.div>

            <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
              <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 via-fuchsia-500/5 to-transparent pr-20">
                <div className="min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <span>{formatMeta(result.type).emoji}</span>
                    <span className="truncate">
                      {formatMeta(result.type).label}
                      {result.dayNumber ? ` · день ${result.dayNumber}` : ""}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {styleMeta(result.style).label} · {when(result.createdAt)}
                    {result.generated === false && " · локальный черновик"}
                  </div>
                </div>
                {!result.generated && (
                  <span className="shrink-0 text-[10px] font-medium rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    без AI-ключа
                  </span>
                )}
              </div>

              <div
                className="p-4 sm:p-5 prose prose-sm dark:prose-invert max-w-none
                prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1.5
                prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                prose-p:leading-relaxed prose-p:my-2
                prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2
                prose-strong:font-semibold
                prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                prose-blockquote:border-l-primary prose-blockquote:not-italic prose-blockquote:text-muted-foreground"
              >
                <ReactMarkdown>{result.content}</ReactMarkdown>
              </div>

              <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/30">
                <button
                  type="button"
                  onClick={share}
                  className="flex-1 min-h-11 rounded-xl bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/15 transition-colors"
                >
                  <Share2 className="size-4" /> Поделиться
                </button>
                <button
                  type="button"
                  onClick={copy}
                  aria-label="Копировать текст"
                  title="Копировать"
                  className="size-11 rounded-xl border border-border bg-card grid place-items-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => write(result.type)}
                  disabled={ai.isPending}
                  aria-label="Написать заново"
                  title="Написать заново в этом же стиле"
                  className="size-11 rounded-xl border border-border bg-card grid place-items-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
                >
                  {ai.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ошибка генерации ── */}
      {ai.isError && !result && !ai.isPending && (
        <div className="rounded-2xl bg-red-500/5 border border-red-500/20 p-4 text-center space-y-2">
          <AlertCircle className="size-8 mx-auto text-red-500" />
          <p className="text-sm font-medium text-red-500">Не получилось написать</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            {ai.error instanceof Error ? ai.error.message : "Попробуйте позже"}
          </p>
          {format && (
            <button
              type="button"
              onClick={() => write(format)}
              disabled={ai.isPending}
              className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 min-h-11 rounded-lg bg-primary text-primary-foreground"
            >
              <RefreshCw className="size-3.5" /> Повторить
            </button>
          )}
        </div>
      )}

      {/* ── Пустой экран ── */}
      {!result && !ai.isPending && !ai.isError && (
        <div className="rounded-2xl border-2 border-dashed border-border py-10 px-6 text-center">
          <motion.div
            animate={reduced ? undefined : { y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="text-5xl mb-3"
          >
            🪄
          </motion.div>
          <p className="text-sm font-medium">
            Выберите формат и стиль — и нажмите «Написать историю»
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
            Соберём текст по вашим дням, местам, дневнику и тратам. Одинаковые данные — шесть
            разных голосов.
          </p>
          {format !== suggested && (
            <button
              type="button"
              onClick={() => setFormat(suggested)}
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 text-primary px-4 text-xs font-medium"
            >
              {formatMeta(suggested).emoji} Подойдёт «{formatMeta(suggested).label}» →
            </button>
          )}
        </div>
      )}

      {/* ── История ── */}
      {history.length > 0 && (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="w-full min-h-12 rounded-2xl border border-dashed border-border bg-card px-4 flex items-center justify-between text-sm hover:border-primary/40 transition-colors"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <History className="size-4" /> История рассказов
          </span>
          <span className="text-xs text-muted-foreground">
            {history.length} {plural(history.length, "рассказ", "рассказа", "рассказов")} →
          </span>
        </button>
      )}

      {trip && result && (
        <p className="text-xs text-muted-foreground text-center px-4 leading-relaxed">
          ✨ На основе {trip.visitedPlaces} посещённых мест, {trip.totalPhotos} фото,{" "}
          {trip.totalJournals} записей и {sym}
          {trip.totalSpent.toFixed(0)} трат        </p>
      )}

      {/* ── Шторка истории ── */}
      <MobileBottomSheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title="История рассказов"
        titleIcon={<History className="size-4 text-primary" />}
      >
        <div className="space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Пока пусто — сгенерируйте первый рассказ
            </p>
          )}
          {history.map((h) => {
            const fm = formatMeta(h.type);
            const sm = styleMeta(h.style);
            return (
              <div
                key={h.id}
                className="rounded-2xl border border-border bg-card p-3 flex items-start gap-3"
              >
                <button
                  type="button"
                  onClick={() => {
                    setResult({ ...h, fromHistory: true });
                    setFormat(h.type);
                    setStyle(h.style);
                    // Восстанавливаем день, иначе «Написать заново» возьмёт текущий/ранее выбранный
                    if (h.type === "day") setDayNum(h.dayNumber ?? null);
                    setHistoryOpen(false);
                    toast.success("Рассказ открыт", {
                      description: "Нажмите «Написать заново», чтобы обновить",
                    });
                  }}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold flex-wrap">
                    <span>{fm.emoji}</span>
                    <span>
                      {fm.label}
                      {h.dayNumber ? ` · день ${h.dayNumber}` : ""}
                    </span>
                    <span className="text-muted-foreground font-normal">
                      · {sm.emoji} {sm.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {plainText(h.content).slice(0, 140)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">{when(h.createdAt)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => removeFromHistory(h.id)}
                  aria-label="Удалить из истории"
                  className="size-9 shrink-0 rounded-lg grid place-items-center text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      </MobileBottomSheet>
    </div>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────

function Hero({
  tripTitle,
  stats,
}: {
  tripTitle?: string;
  stats?: { day: string; places: string; photos: number; journals: number };
}) {
  const reduced = useReducedMotion();
  return (
    <div className="relative rounded-3xl p-5 bg-gradient-to-br from-violet-600 via-fuchsia-500 to-orange-500 text-white shadow-xl overflow-hidden">
      <div
        aria-hidden
        className="absolute -bottom-8 -right-4 text-[120px] opacity-15 select-none leading-none"
      >
        ✨
      </div>
      {!reduced && (
        <motion.div
          aria-hidden
          animate={{ y: [0, -10, 0], opacity: [0.25, 0.5, 0.25] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-6 right-10 text-2xl select-none"
        >
          ✦
        </motion.div>
      )}
      <div className="relative">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/70 mb-1.5">
          AI-итоги{tripTitle ? ` · ${tripTitle}` : ""}
        </div>
        <h1 className="text-2xl font-bold">Магия воспоминаний</h1>
        <p className="text-white/80 text-sm mt-1 max-w-[28ch]">
          Из ваших мест, дневника и трат — готовая история, которую не стыдно переслать
        </p>
        {stats && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            <StatChip>{stats.day}</StatChip>
            <StatChip>{stats.places}</StatChip>
            <StatChip>📷 {stats.photos}</StatChip>
            <StatChip>📔 {stats.journals}</StatChip>
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/15 backdrop-blur px-2.5 py-1 text-[11px] font-medium whitespace-nowrap">
      {children}
    </span>
  );
}
