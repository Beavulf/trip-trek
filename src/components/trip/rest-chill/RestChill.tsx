"use client";

import { useMemo, useState } from "react";
import { useDays, useTrip } from "@/hooks/use-trip";
import { Coffee, ListPlus, Locate, Search, Star, Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHILL_CATEGORIES } from "@/lib/chill-categories";
import { ChillCard } from "./ChillCard";
import { NearbyView } from "./NearbyView";
import { WishlistView } from "./WishlistView";
import { RestTimer } from "../rest-timer";
import { loadWishlist, migrateLegacyWishlist } from "@/lib/wishlist";
import { useTripStore } from "@/lib/trip-store";

type View = "route" | "wishlist" | "nearby";

export function RestChill() {
  const { data: days, isLoading: daysLoading, error: daysError } = useDays();
  const { data: trip } = useTrip();
  const currency = trip?.settings.currency ?? "USD";
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("route");
  const [nearbyCat, setNearbyCat] = useState<string>("all");
  const { setSelectedDay, setActiveTab } = useTripStore();

  // Wishlist count для hero-метрики (P2 #17)
  const wishlistCount = useMemo(() => {
    if (typeof window === "undefined") return 0;
    migrateLegacyWishlist(trip?.settings.tripId);
    return loadWishlist(trip?.settings.tripId).length;
  }, [trip?.settings.tripId, view]);

  const places = useMemo(() => {
    if (!days) return [];
    return days.flatMap((d) =>
      d.places
        .filter((p) => (CHILL_CATEGORIES as readonly string[]).includes(p.category))
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

  // P0 #1: нет trip / ошибка → empty/error, не default-trip
  if (daysError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить маршрут</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (daysLoading) {
    return (
      <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Загрузка…
      </div>
    );
  }

  const stats = {
    total: places.length,
    visited: places.filter((p) => p.place.status === "visited").length,
    wishlist: wishlistCount,
  };

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* P1 #10: trip-agnostic RU hero — без "Rest & Chill" EN, без China copy */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-6 text-[100px] opacity-15 select-none">☕</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <Coffee className="size-4" /> Отдых и перекус
          </div>
          <h1 className="text-2xl font-bold">Где присесть и отдохнуть</h1>
          <p className="text-white/80 text-sm mt-1">
            Кафе, бары и рестораны из маршрута и поблизости
            {trip?.settings.title && <span className="text-white/60"> · {trip.settings.title}</span>}
          </p>
          <div className="flex gap-4 mt-3">
            <div>
              <div className="text-2xl font-bold tabular-nums">{stats.visited}</div>
              <div className="text-xs text-white/70">посещено</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
              <div className="text-xs text-white/70">в маршруте</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">{stats.wishlist}</div>
              <div className="text-xs text-white/70">в «Хочу»</div>
            </div>
          </div>
        </div>
      </div>

      {/* P1 #11: RestTimer встроен под hero (раньше orphan, нигде не импортировался) */}
      <RestTimer />

      {/* P2 #15: переключатель min-h-[44px] для mobile touch target */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-card border border-border rounded-2xl">
        <button
          onClick={() => setView("route")}
          className={cn(
            "min-h-[44px] rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-all",
            view === "route" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <ListPlus className="size-4" /> Маршрут
        </button>
        <button
          onClick={() => setView("wishlist")}
          className={cn(
            "min-h-[44px] rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-all",
            view === "wishlist" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <Star className="size-4" /> Хочу
        </button>
        <button
          onClick={() => setView("nearby")}
          className={cn(
            "min-h-[44px] rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-all",
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
                className="w-full rounded-xl border border-input bg-card pl-9 pr-3 py-2.5 text-sm"
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
                    "min-h-[36px] flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                    filter === f.key ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
                  )}
                >
                  <span>{f.emoji}</span> {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Список */}
          {filtered.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {filtered.map(({ place, day }) => (
                <ChillCard key={place.id} place={place} day={day} currency={currency} />
              ))}
            </div>
          ) : (
            // P1 #8: различаем empty cases — нет chill-мест / фильтр / нет дней
            <EmptyRouteState
              hasDays={(days?.length ?? 0) > 0}
              hasAnyChill={places.length > 0}
              hasFilter={filter !== "all" || query !== ""}
              onResetFilter={() => { setFilter("all"); setQuery(""); }}
              onGoToItinerary={() => { setActiveTab("itinerary"); }}
            />
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

// P1 #8: пустое состояние с дифференциацией
function EmptyRouteState({
  hasDays,
  hasAnyChill,
  hasFilter,
  onResetFilter,
  onGoToItinerary,
}: {
  hasDays: boolean;
  hasAnyChill: boolean;
  hasFilter: boolean;
  onResetFilter: () => void;
  onGoToItinerary: () => void;
}) {
  if (!hasDays) {
    return (
      <div className="text-center py-12 space-y-2">
        <div className="text-4xl">🗺️</div>
        <p className="text-sm font-medium">Сначала создайте маршрут</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          В закладке «Маршрут» добавьте дни и места — кафе и бары появятся здесь автоматически.
        </p>
        <button
          onClick={onGoToItinerary}
          className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground"
        >
          <MapPin className="size-3.5" /> Перейти в Маршрут
        </button>
      </div>
    );
  }
  if (hasFilter) {
    return (
      <div className="text-center py-12 space-y-2">
        <div className="text-4xl">🔍</div>
        <p className="text-sm font-medium">Ничего не найдено</p>
        <p className="text-xs text-muted-foreground">Попробуйте сбросить фильтр или поиск</p>
        <button
          onClick={onResetFilter}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground"
        >
          Сбросить фильтр
        </button>
      </div>
    );
  }
  if (!hasAnyChill) {
    return (
      <div className="text-center py-12 space-y-2">
        <div className="text-4xl">☕</div>
        <p className="text-sm font-medium">Пока нет кафе и баров в маршруте</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Добавьте места с категорией «Кафе», «Бар» или «Ресторан» в Маршруте — они появятся здесь.
        </p>
        <button
          onClick={onGoToItinerary}
          className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground"
        >
          <MapPin className="size-3.5" /> Перейти в Маршрут
        </button>
      </div>
    );
  }
  return (
    <div className="text-center py-12 text-muted-foreground text-sm">Ничего не найдено</div>
  );
}
