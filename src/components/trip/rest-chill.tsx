"use client";

import { useDays, useUpdatePlace } from "@/hooks/use-trip";
import { CATEGORY_META, type Place, type Day } from "@/lib/types";
import { Coffee, Star, MapPin, Clock, CheckCircle2, Circle, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CHILL_CATEGORIES = ["cafe", "bar", "restaurant"];

export function RestChill() {
  const { data: days, isLoading } = useDays();
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const places = useMemo(() => {
    if (!days) return [];
    return days.flatMap((d) =>
      d.places
        .filter((p) => CHILL_CATEGORIES.includes(p.category))
        .map((p) => ({ place: p, day: d }))
    );
  }, [days]);

  const filtered = useMemo(() => {
    return places.filter(({ place }) => {
      if (filter !== "all" && place.category !== filter) return false;
      if (query && !place.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [places, filter, query]);

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Загрузка…</div>;

  const stats = {
    total: places.length,
    visited: places.filter((p) => p.place.status === "visited").length,
  };

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-6 text-[100px] opacity-15 select-none">☕</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <Coffee className="size-4" /> Rest & Chill
          </div>
          <h1 className="text-2xl font-bold">Где присесть и отдохнуть</h1>
          <p className="text-white/80 text-sm mt-1">Кафе, бары и рестораны из маршрута</p>
          <div className="flex gap-4 mt-3">
            <div>
              <div className="text-2xl font-bold">{stats.visited}</div>
              <div className="text-xs text-white/70">посещено</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-white/70">всего мест</div>
            </div>
          </div>
        </div>
      </div>

      {/* Поиск + фильтры */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск места…"
            className="w-full rounded-xl border border-input bg-card pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: "all", label: "Все", emoji: "✨" },
            { key: "cafe", label: "Кафе", emoji: "☕" },
            { key: "bar", label: "Бары", emoji: "🍸" },
            { key: "restaurant", label: "Рестораны", emoji: "🍽️" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                filter === f.key ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
              )}
            >
              <span>{f.emoji}</span> {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Список */}
      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map(({ place, day }) => (
          <ChillCard key={place.id} place={place} day={day} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">Ничего не найдено</div>
      )}
    </div>
  );
}

function ChillCard({ place, day }: { place: Place; day: Day }) {
  const update = useUpdatePlace();
  const meta = CATEGORY_META[place.category];
  const visited = place.status === "visited";

  return (
    <motion.div
      layout
      className={cn(
        "rounded-2xl border p-4 transition-colors",
        visited ? "bg-green-500/5 border-green-500/30" : "bg-card border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="size-12 rounded-xl grid place-items-center text-2xl shrink-0" style={{ background: `${meta?.color}22` }}>
          {meta?.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm leading-tight">{place.name}</h3>
            <button
              onClick={() => {
                update.mutate({ id: place.id, status: visited ? "planned" : "visited" });
                toast(visited ? "Снято" : "Отдохнули! 🍵", { description: place.name });
              }}
            >
              {visited ? <CheckCircle2 className="size-5 text-green-500" /> : <Circle className="size-5 text-muted-foreground" />}
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <MapPin className="size-2.5" /> День {day.dayNumber} · {day.city}
          </div>
          {place.description && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{place.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {place.budget ? (
              <span className="text-xs text-muted-foreground">${place.budget}</span>
            ) : null}
            {place.timeOfDay && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Clock className="size-2.5" /> {timeLabel(place.timeOfDay)}
              </span>
            )}
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => update.mutate({ id: place.id, rating: s === place.rating ? null : s })}
                >
                  <Star className={cn("size-3.5", (place.rating ?? 0) >= s ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function timeLabel(t: string | null) {
  switch (t) {
    case "morning": return "Утро";
    case "afternoon": return "День";
    case "evening": return "Вечер";
    default: return "";
  }
}
