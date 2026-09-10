"use client";

import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Loader2, CornerDownLeft, Clock, Trash2 } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useTripStore } from "@/lib/trip-store";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useCurrentTripId } from "@/hooks/use-trip";

interface SearchResult {
  id: string;
  type: "city" | "place" | "phrase" | "food" | "expense" | "journal";
  title: string;
  subtitle: string;
  meta?: string;
  icon: string;
  dayNumber?: number | null;
  cityKey?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  city: "Город",
  place: "Место",
  phrase: "Фраза",
  food: "Блюдо",
  expense: "Трата",
  journal: "Дневник",
};

const TYPE_COLORS: Record<string, string> = {
  city: "#0ea5e9",
  place: "#f97316",
  phrase: "#06b6d4",
  food: "#ef4444",
  expense: "#10b981",
  journal: "#8b5cf6",
};

const RECENTS_KEY = "triptrek:search-recents";

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  try {
    const next = [q, ...loadRecents().filter((x) => x !== q)].slice(0, 5);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // приватный режим — просто не сохраняем
  }
}

/** Подсветка совпавших слов в тексте результата */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length || !text) return <>{text}</>;
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
  if (!esc.length) return <>{text}</>;
  const re = new RegExp(`(${esc.join("|")})`, "gi");
  const parts = text.split(re);
  const lower = new Set(words.map((w) => w.toLowerCase()));
  return (
    <>
      {parts.map((p, i) =>
        lower.has(p.toLowerCase()) ? (
          <mark key={i} className="bg-primary/20 text-foreground rounded-sm px-0.5">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useBodyScrollLock(open);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const tripId = useCurrentTripId();
  const { setActiveTab, setSelectedDay, setTripSwitcherOpen, setMapCityFilter } = useTripStore();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 280);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ results: SearchResult[] }>({
    queryKey: ["search", debounced, tripId],
    queryFn: async () => {
      if (!tripId) throw new Error("no trip");
      const url = `/api/search?q=${encodeURIComponent(debounced)}&tripId=${encodeURIComponent(tripId)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("search failed");
      return r.json();
    },
    enabled: open && !!tripId && debounced.length >= 2,
  });

  const results = data?.results ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    results.forEach((r) => {
      const arr = map.get(r.type) ?? [];
      arr.push(r);
      map.set(r.type, arr);
    });
    return Array.from(map.entries());
  }, [results]);

  const flatResults = results;
  const queryWords = useMemo(() => debounced.toLowerCase().split(/\s+/).filter(Boolean), [debounced]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [debounced]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDebounced("");
      setRecents(loadRecents());
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const onResultClick = (r: SearchResult) => {
    if (query.trim()) saveRecent(query.trim());
    if (r.type === "city" && r.cityKey) {
      setSelectedDay(null);
      setMapCityFilter(r.cityKey);
      setActiveTab("map");
    } else {
      if (r.dayNumber != null) setSelectedDay(r.dayNumber);
      else setSelectedDay(null);
      switch (r.type) {
        case "place":
          setActiveTab("itinerary");
          break;
        case "phrase":
          setActiveTab("phrases");
          break;
        case "food":
          setActiveTab("food");
          break;
        case "expense":
          setActiveTab("budget");
          break;
        case "journal":
          setActiveTab("journal");
          break;
      }
    }
    onOpenChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatResults[selectedIdx]) {
      e.preventDefault();
      onResultClick(flatResults[selectedIdx]);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  let runningIdx = -1;
  const busy = isLoading || isFetching;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-start justify-center sm:pt-[10vh] sm:px-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)]"
        >
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            {busy ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Search className="size-5 text-muted-foreground" />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Поиск: города, места, фразы, блюда…"
              className="flex-1 bg-transparent outline-none text-base input-mobile placeholder:text-muted-foreground"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Очистить"
                className="size-11 rounded-md hover:bg-accent grid place-items-center text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Закрыть"
                className="size-11 rounded-md hover:bg-accent grid place-items-center text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {!tripId ? (
              <div className="px-4 py-8 text-center space-y-3">
                <p className="text-sm font-medium">Нет активной поездки</p>
                <p className="text-xs text-muted-foreground">Поиск работает внутри выбранной поездки</p>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    setTripSwitcherOpen(true);
                  }}
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  Мои поездки →
                </button>
              </div>
            ) : query.trim().length < 2 ? (
              <div className="px-4 py-6">
                {recents.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Clock className="size-3" /> Недавние запросы
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.removeItem(RECENTS_KEY);
                          setRecents([]);
                        }}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground min-h-8 px-1.5"
                        aria-label="Очистить историю поиска"
                      >
                        <Trash2 className="size-3" /> Очистить
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recents.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setQuery(r)}
                          className="min-h-9 px-3 rounded-full bg-muted hover:bg-accent text-xs font-medium transition-colors"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-2">
                    <p>Введи минимум 2 символа</p>
                    <p className="text-xs mt-1 text-muted-foreground/70">
                      Города, места, фразы, блюда, траты и дневник
                    </p>
                  </div>
                )}
              </div>
            ) : isError ? (
              <div className="px-4 py-8 text-center space-y-3">
                <p className="text-sm font-medium">Не удалось выполнить поиск</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  Повторить
                </button>
              </div>
            ) : results.length === 0 && !busy ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Ничего не найдено по запросу «{query}»
              </div>
            ) : (
              <div className="py-2">
                {grouped.map(([type, items]) => (
                  <div key={type} className="mb-1">
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full" style={{ background: TYPE_COLORS[type] }} />
                      {TYPE_LABELS[type]} ({items.length})
                    </div>
                    {items.map((r) => {
                      runningIdx++;
                      const idx = runningIdx;
                      const selected = idx === selectedIdx;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => onResultClick(r)}
                          onMouseEnter={() => setSelectedIdx(idx)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors min-h-11",
                            selected ? "bg-accent" : "hover:bg-accent/50"
                          )}
                        >
                          <div
                            className="size-9 rounded-lg grid place-items-center text-lg shrink-0"
                            style={{ background: `${TYPE_COLORS[type]}22` }}
                          >
                            {r.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              <Highlight text={r.title} words={queryWords} />
                            </div>
                            {r.subtitle && (
                              <div className="text-xs text-muted-foreground truncate">
                                <Highlight text={r.subtitle} words={queryWords} />
                              </div>
                            )}
                          </div>
                          {r.meta && (
                            <div className="text-[10px] text-muted-foreground shrink-0">{r.meta}</div>
                          )}
                          {selected && (
                            <CornerDownLeft className="size-3.5 text-muted-foreground shrink-0 hidden sm:block" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
            <div className="hidden sm:flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-[9px]">↑↓</kbd> навигация
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-[9px]">↵</kbd> выбрать
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-[9px]">esc</kbd> закрыть
              </span>
            </div>
            <span className="sm:ml-auto">
              {query.trim().length < 2 ? "" : `${results.length} результатов`}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
