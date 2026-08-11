"use client";

import { useMemo, useState } from "react";
import { useDays } from "@/hooks/use-trip";
import { Coffee, ListPlus, Locate, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChillCard } from "./ChillCard";
import { NearbyView } from "./NearbyView";
import { WishlistView } from "./WishlistView";

const CHILL_CATEGORIES = ["cafe", "bar", "restaurant"];

export function RestChill() {
  const { data: days, isLoading } = useDays();
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"route" | "wishlist" | "nearby">("route");
  const [nearbyCat, setNearbyCat] = useState<string>("all");

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
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-6 text-[100px] opacity-15 select-none">☕</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <Coffee className="size-4" /> Rest & Chill
          </div>
          <h1 className="text-2xl font-bold">Где присесть и отдохнуть</h1>
          <p className="text-white/80 text-sm mt-1">Кафе, бары и рестораны из маршрута и поблизости</p>
          <div className="flex gap-4 mt-3">
            <div>
              <div className="text-2xl font-bold">{stats.visited}</div>
              <div className="text-xs text-white/70">посещено</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-white/70">в маршруте</div>
            </div>
          </div>
        </div>
      </div>

      {/* Переключатель: маршрут / хочу посетить / поблизости */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-card border border-border rounded-2xl">
        <button
          onClick={() => setView("route")}
          className={cn(
            "rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-all",
            view === "route" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <ListPlus className="size-4" /> Маршрут
        </button>
        <button
          onClick={() => setView("wishlist")}
          className={cn(
            "rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-all",
            view === "wishlist" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <Star className="size-4" /> Хочу
        </button>
        <button
          onClick={() => setView("nearby")}
          className={cn(
            "rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-all",
            view === "nearby" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <Locate className="size-4" /> Рядом
        </button>
      </div>

      {view === "route" ? (
        <>
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
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
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
                    "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
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
        </>
      ) : view === "wishlist" ? (
        <WishlistView />
      ) : (
        <NearbyView category={nearbyCat} onCategoryChange={setNearbyCat} />
      )}
    </div>
  );
}
