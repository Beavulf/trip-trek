"use client";

import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Loader2, CornerDownLeft } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useTripStore } from "@/lib/trip-store";
import { CITIES } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { getTripId } from "@/hooks/use-trip";

interface SearchResult {
  id: string;
  type: "place" | "phrase" | "food" | "expense" | "journal";
  title: string;
  subtitle: string;
  meta?: string;
  icon: string;
}

const TYPE_LABELS: Record<string, string> = {
  place: "Место",
  phrase: "Фраза",
  food: "Блюдо",
  expense: "Трата",
  journal: "Дневник",
};

const TYPE_COLORS: Record<string, string> = {
  place: "#f97316",
  phrase: "#06b6d4",
  food: "#ef4444",
  expense: "#10b981",
  journal: "#8b5cf6",
};

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useBodyScrollLock(open);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setActiveTab, setSelectedDay } = useTripStore();

  const { data, isLoading } = useQuery<{ results: SearchResult[] }>({
    queryKey: ["search", query, getTripId()],
    queryFn: async () => {
      // P1 #11: передаём tripId чтобы сервер отфильтровал journal по текущей поездке
      const tripId = getTripId();
      const url = `/api/search?q=${encodeURIComponent(query)}${tripId ? `&tripId=${tripId}` : ""}`;
      const r = await fetch(url);
      return r.json();
    },
    enabled: query.trim().length >= 2,
  });

  const results = data?.results ?? [];

  // Группировка по типу
  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    results.forEach((r) => {
      const arr = map.get(r.type) ?? [];
      arr.push(r);
      map.set(r.type, arr);
    });
    return Array.from(map.entries());
  }, [results]);

  const flatResults = useMemo(() => results, [results]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const onResultClick = (r: SearchResult) => {
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
    setSelectedDay(null);
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

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      >
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full max-w-xl rounded-2xl border border-border shadow-2xl overflow-hidden"
        >
          {/* Поле поиска */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            {isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Search className="size-5 text-muted-foreground" />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Поиск: места, фразы, блюда, траты…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
            <button
              onClick={() => onOpenChange(false)}
              className="size-7 rounded-md hover:bg-accent grid place-items-center text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Результаты */}
          <div className="max-h-[60vh] overflow-y-auto">
            {query.trim().length < 2 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                <p>Введите минимум 2 символа</p>
                <p className="text-xs mt-1 text-muted-foreground/70">Поиск по местам, фразам, блюдам, тратам и дневнику</p>
              </div>
            ) : results.length === 0 && !isLoading ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Ничего не найдено по запросу «{query}»
              </div>
            ) : (
              <div className="py-2">
                {grouped.map(([type, items]) => (
                  <div key={type} className="mb-1">
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center gap-1.5">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: TYPE_COLORS[type] }}
                      />
                      {TYPE_LABELS[type]} ({items.length})
                    </div>
                    {items.map((r) => {
                      runningIdx++;
                      const idx = runningIdx;
                      const selected = idx === selectedIdx;
                      return (
                        <button
                          key={r.id}
                          onClick={() => onResultClick(r)}
                          onMouseEnter={() => setSelectedIdx(idx)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                            selected ? "bg-accent" : "hover:bg-accent/50"
                          )}
                        >
                          <div className="size-9 rounded-lg grid place-items-center text-lg shrink-0" style={{ background: `${TYPE_COLORS[type]}22` }}>
                            {r.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{r.title}</div>
                            {r.subtitle && (
                              <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>
                            )}
                          </div>
                          {r.meta && (
                            <div className="text-[10px] text-muted-foreground shrink-0">{r.meta}</div>
                          )}
                          {selected && (
                            <CornerDownLeft className="size-3.5 text-muted-foreground shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Подвал */}
          <div className="px-4 py-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
            <div className="flex items-center gap-3">
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
            <span>{results.length} результатов</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
