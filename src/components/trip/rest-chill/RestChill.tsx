"use client";

import { useEffect, useMemo, useState } from "react";
import { useDays, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import {
  Coffee,
  Eye,
  EyeOff,
  ListPlus,
  Locate,
  Search,
  Star,
  Loader2,
  MapPin,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CHILL_CATEGORIES, CHILL_CATEGORY_LABELS } from "@/lib/chill-categories";
import { plural } from "@/lib/utils";
import { ChillCard } from "./ChillCard";
import { NearbyView } from "./NearbyView";
import { WishlistView } from "./WishlistView";
import { loadWishlist, migrateLegacyWishlist } from "@/lib/wishlist";
import { useTripStore } from "@/lib/trip-store";

type View = "route" | "wishlist" | "nearby";

// Приветствие под текущий час — перекликается с timeOfDay у мест.
function timeGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return { text: "Доброе утро — время кофе", emoji: "☕" };
  if (h >= 11 && h < 15) return { text: "Обеденный час — найдём место поесть", emoji: "🍜" };
  if (h >= 15 && h < 18) return { text: "Время кофе-брейка", emoji: "☕" };
  if (h >= 18 && h < 23) return { text: "Вечер — время бара", emoji: "🍸" };
  return { text: "Поздний час — что-нибудь лёгкое?", emoji: "🌙" };
}

export function RestChill() {
  const tripId = useCurrentTripId();
  const { data: days, isLoading: daysLoading, error: daysError, refetch: refetchDays } = useDays();
  const { data: trip } = useTrip();
  const currency = trip?.settings.currency ?? "USD";
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("route");
  const [nearbyCat, setNearbyCat] = useState<string>("all");
  const [hideVisited, setHideVisited] = useState(false);
  // Версия wishlist: saveWishlist диспатчит "triptrek-wishlist-changed" — счётчик в hero и бейдж живые
  const [wishlistVersion, setWishlistVersion] = useState(0);
  const [greeting, setGreeting] = useState<{ text: string; emoji: string } | null>(null);
  const { setSelectedDay, setActiveTab, setTripSwitcherOpen } = useTripStore();
  const reduceMotion = useReducedMotion();

  // Час зависит от устройства — считаем только на клиенте, чтобы не ловить hydration mismatch.
  useEffect(() => {
    // Клиентское время нельзя вычислять при SSR-рендере, поэтому setState в effect на монтировании.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(timeGreeting());
  }, []);

  useEffect(() => {
    // Сначала подписка, потом миграция: migrate пишет через saveWishlist → событие поднимет счётчик.
    const onWishlistChanged = () => setWishlistVersion((v) => v + 1);
    window.addEventListener("triptrek-wishlist-changed", onWishlistChanged);
    migrateLegacyWishlist(tripId);
    return () => window.removeEventListener("triptrek-wishlist-changed", onWishlistChanged);
  }, [tripId]);

  const wishlistCount = useMemo(() => {
    if (typeof window === "undefined" || !tripId) return 0;
    return loadWishlist(tripId).length;
  }, [tripId, view, wishlistVersion]);

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
      if (hideVisited && place.status === "visited") return false;
      if (query && !place.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [places, filter, query, hideVisited]);

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">☕</div>
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

  if (daysError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить маршрут</p>
        <button
          type="button"
          onClick={() => refetchDays()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (daysLoading) {
    return (
      <div className="space-y-4 animate-fade-up pb-20" aria-busy="true" aria-label="Загрузка">
        <div className="rounded-3xl h-44 bg-gradient-to-br from-amber-500/70 to-orange-600/70 animate-pulse" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-card border border-border animate-pulse" />
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Загрузка маршрута…
        </div>
      </div>
    );
  }

  const stats = {
    total: places.length,
    visited: places.filter((p) => p.place.status === "visited").length,
    wishlist: wishlistCount,
  };
  const progressPct = stats.total > 0 ? Math.round((stats.visited / stats.total) * 100) : 0;
  const isFiltering = filter !== "all" || query !== "" || hideVisited;

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Живой hero: приветствие по времени суток, тапабельные статы, прогресс, пар */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-6 text-[100px] opacity-15 select-none">☕</div>
        {!reduceMotion && (
          <div className="absolute right-12 top-10 pointer-events-none" aria-hidden="true">
            {[0, 1].map((i) => (
              <motion.span
                key={i}
                className="absolute block w-1.5 h-5 rounded-full bg-white/50 blur-[2px]"
                style={{ left: i * 12, bottom: 0 }}
                animate={{ y: -22, opacity: [0, 0.45, 0], scaleX: [1, 0.6, 1.3] }}
                transition={{ duration: 3.2, repeat: Infinity, delay: i * 1.6, ease: "easeOut" }}
              />
            ))}
          </div>
        )}
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-[11px] font-semibold uppercase tracking-wider mb-1">
            <Coffee className="size-3.5" /> Отдых и перекус
          </div>
          <h1 className="text-2xl font-bold">Где присесть и отдохнуть</h1>
          <p className="text-white/85 text-sm mt-1.5" aria-live="polite">
            {greeting ? (
              <>
                {greeting.emoji} {greeting.text}
              </>
            ) : (
              "Кафе, бары и рестораны"
            )}
            {trip?.settings.title && <span className="text-white/60"> · {trip.settings.title}</span>}
          </p>

          {/* Статы — это кнопки: тап ведёт в соответствующий раздел */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <button
              type="button"
              onClick={() => setView("route")}
              aria-label={`Посещено: ${stats.visited}. Открыть маршрут`}
              className="rounded-xl bg-white/15 backdrop-blur px-2 py-2 text-center active:scale-95 transition-transform hover:bg-white/20"
            >
              <div className="text-xl font-bold tabular-nums leading-tight">{stats.visited}</div>
              <div className="text-[10px] text-white/75">посещено</div>
            </button>
            <button
              type="button"
              onClick={() => setView("route")}
              aria-label={`В маршруте: ${stats.total}. Открыть маршрут`}
              className="rounded-xl bg-white/15 backdrop-blur px-2 py-2 text-center active:scale-95 transition-transform hover:bg-white/20"
            >
              <div className="text-xl font-bold tabular-nums leading-tight">{stats.total}</div>
              <div className="text-[10px] text-white/75">в маршруте</div>
            </button>
            <button
              type="button"
              onClick={() => setView("wishlist")}
              aria-label={`В списке «Хочу»: ${stats.wishlist}. Открыть список`}
              className="rounded-xl bg-white/15 backdrop-blur px-2 py-2 text-center active:scale-95 transition-transform hover:bg-white/20"
            >
              <div className="text-xl font-bold tabular-nums leading-tight flex items-center justify-center gap-1">
                {stats.wishlist} <span aria-hidden="true" className="text-xs">→</span>
              </div>
              <div className="text-[10px] text-white/75">в «Хочу»</div>
            </button>
          </div>

          {/* Прогресс «отдыха»: сколько chill-мест маршрута уже посещено */}
          {stats.total > 0 && (
            <div
              className="mt-3 h-1.5 rounded-full bg-white/25 overflow-hidden"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Посещено ${progressPct}% мест отдыха`}
            >
              <motion.div
                className="h-full rounded-full bg-white"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Переключатель разделов: min-h-[44px] для mobile touch target, бейдж-счётчик на «Хочу» */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-card border border-border rounded-2xl">
        <button
          onClick={() => setView("route")}
          aria-pressed={view === "route"}
          className={cn(
            "min-h-[44px] rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-all",
            view === "route" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <ListPlus className="size-4" /> Маршрут
        </button>
        <button
          onClick={() => setView("wishlist")}
          aria-pressed={view === "wishlist"}
          className={cn(
            "relative min-h-[44px] rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-all",
            view === "wishlist" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <Star className="size-4" /> Хочу
          {wishlistCount > 0 && view !== "wishlist" && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
              {wishlistCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setView("nearby")}
          aria-pressed={view === "nearby"}
          className={cn(
            "min-h-[44px] rounded-xl py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-all",
            view === "nearby" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <Locate className="size-4" /> Рядом
        </button>
      </div>

      <div key={view} className="animate-fade-up">
        {view === "route" ? (
          <>
            {/* Поиск + фильтры */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск места…"
                  aria-label="Поиск места"
                  className="w-full rounded-xl border border-input bg-card pl-9 pr-10 py-2.5 text-sm"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Очистить поиск"
                    className="absolute right-0 top-1/2 -translate-y-1/2 size-11 grid place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <div className="chip-rail no-scrollbar">
                <button
                  onClick={() => setFilter("all")}
                  className={cn(
                    "min-h-11 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                    filter === "all" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
                  )}
                >
                  <span>✨</span> Все
                </button>
                {CHILL_CATEGORIES.map((key) => {
                  const meta = CHILL_CATEGORY_LABELS[key];
                  return (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className={cn(
                        "min-h-11 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                        filter === key ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
                      )}
                    >
                      <span>{meta.emoji}</span> {meta.label}
                    </button>
                  );
                })}
                {/* Тумблер «скрыть посещённые» — отдельный вид, не категория */}
                <button
                  onClick={() => setHideVisited((v) => !v)}
                  aria-pressed={hideVisited}
                  className={cn(
                    "min-h-11 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                    hideVisited
                      ? "bg-primary/10 text-primary border border-primary/40"
                      : "bg-card border border-dashed border-border text-muted-foreground hover:bg-accent"
                  )}
                >
                  {hideVisited ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  Скрыть посещённые
                </button>
              </div>
              {isFiltering && (
                <p className="text-[11px] text-muted-foreground px-1" aria-live="polite">
                  Найдено: {filtered.length} {plural(filtered.length, "место", "места", "мест")}
                </p>
              )}
            </div>

            {/* Список */}
            {filtered.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {filtered.map(({ place, day }) => (
                  <ChillCard key={place.id} place={place} day={day} currency={currency} />
                ))}
              </div>
            ) : (
              <EmptyRouteState
                hasDays={(days?.length ?? 0) > 0}
                hasAnyChill={places.length > 0}
                hasFilter={isFiltering}
                onResetFilter={() => {
                  setFilter("all");
                  setQuery("");
                  setHideVisited(false);
                }}
                onGoToItinerary={() => {
                  setSelectedDay(null);
                  setActiveTab("itinerary");
                }}
              />
            )}
          </>
        ) : view === "wishlist" ? (
          <WishlistView onGoNearby={() => setView("nearby")} />
        ) : (
          <NearbyView category={nearbyCat} onCategoryChange={setNearbyCat} onGoToWishlist={() => setView("wishlist")} />
        )}
      </div>
    </div>
  );
}

// Пустое состояние с дифференциацией: нет дней / фильтр / нет chill-мест
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
          className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
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
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Сбросить фильтры
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
          className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
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
