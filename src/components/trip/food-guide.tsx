"use client";

import { useFoods, useUpdateFood, parseWantedBy, type FoodItem } from "@/hooks/use-trip";
import { useRouteDays, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  UtensilsCrossed,
  Star,
  MapPin,
  CheckCircle2,
  Circle,
  Loader2,
  Search,
  X,
  Plus,
  Share2,
  Trophy,
  Flame,
  Sparkles,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { useTripStore } from "@/lib/trip-store";
import { currencySymbol } from "@/lib/currencies";
import { FoodSheet } from "./food/FoodSheet";
import { AddFoodSheet } from "./food/AddFoodSheet";
import { FoodPackSheet, FoodRestaurantsSheet } from "./food/FoodAiSheets";
import { CITY_PALETTE, type ParticipantLite } from "./food/shared";

const MEDALS = ["🥇", "🥈", "🥉"];

export function FoodGuide() {
  const tripId = useCurrentTripId();
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "tried" | "todo">("all");
  const [query, setQuery] = useState("");
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [restaurantsOpen, setRestaurantsOpen] = useState(false);
  const { data: foods, isLoading, error: foodsError, refetch: refetchFoods } = useFoods();
  const { data: trip, error: tripError, refetch: refetchTrip } = useTrip();
  const { data: days } = useRouteDays();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const { setTripSwitcherOpen } = useTripStore();
  const priceSym = currencySymbol(trip?.settings?.currency || "USD");

  /* Города маршрута по порядку дней — меню идёт вслед за маршрутом */
  const dayCityOrder = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    (days ?? []).forEach((d) => {
      if (d.city && !seen.has(d.city)) {
        seen.add(d.city);
        out.push(d.city);
      }
    });
    return out;
  }, [days]);

  /* Город → номер первого дня маршрута в этом городе */
  const cityDayNumber = useMemo(() => {
    const m = new Map<string, number>();
    (days ?? []).forEach((d) => {
      if (d.city && !m.has(d.city)) m.set(d.city, d.dayNumber);
    });
    return m;
  }, [days]);

  /* Все города еды: сначала по маршруту, остальные по алфавиту */
  const foodCities = useMemo(() => {
    if (!foods) return [];
    const set = new Set(foods.map((f) => f.city));
    const known = dayCityOrder.filter((c) => set.has(c));
    const rest = Array.from(set)
      .filter((c) => !dayCityOrder.includes(c))
      .sort((a, b) => a.localeCompare(b, "ru"));
    return [...known, ...rest];
  }, [foods, dayCityOrder]);

  const cityColorOf = (city: string) => CITY_PALETTE[Math.max(0, foodCities.indexOf(city)) % CITY_PALETTE.length];

  const filtered = useMemo(() => {
    if (!foods) return [];
    let result = foods;
    if (cityFilter !== "all") result = result.filter((f) => f.city === cityFilter);
    if (status === "tried") result = result.filter((f) => f.tried);
    if (status === "todo") result = result.filter((f) => !f.tried);
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((f) =>
        [f.name, f.nameCn, f.place, f.description].some((s) => s?.toLowerCase().includes(q))
      );
    }
    return result;
  }, [foods, status, cityFilter, query]);

  /* Группировка по городам в порядке маршрута */
  const grouped = useMemo(() => {
    const map = new Map<string, FoodItem[]>();
    filtered.forEach((f) => {
      const arr = map.get(f.city) ?? [];
      arr.push(f);
      map.set(f.city, arr);
    });
    const order = foodCities.filter((c) => map.has(c));
    return order.map((city) => [city, map.get(city)!] as const);
  }, [filtered, foodCities]);

  const triedCount = foods?.filter((f) => f.tried).length ?? 0;
  const totalCount = foods?.length ?? 0;
  const todoCount = totalCount - triedCount;
  const votesTotal = useMemo(
    () => (foods ?? []).reduce((sum, f) => sum + parseWantedBy(f).length, 0),
    [foods]
  );

  /* Топ вкусов: попробованные с оценкой, лучшие сверху */
  const topRated = useMemo(
    () =>
      (foods ?? [])
        .filter((f) => f.tried && (f.rating ?? 0) > 0)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name, "ru"))
        .slice(0, 8),
    [foods]
  );

  const sheetFood = useMemo(() => foods?.find((f) => f.id === sheetId) ?? null, [foods, sheetId]);

  const participants: ParticipantLite[] = useMemo(
    () =>
      (trip?.participants ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji ?? "👤",
        color: p.color ?? "#94a3b8",
      })),
    [trip]
  );

  /* Поделиться меню: системный шеринг → буфер обмена */
  const shareMenu = async () => {
    const list = foods ?? [];
    if (list.length === 0) return;
    const todo = list.filter((f) => !f.tried);
    const best = list
      .filter((f) => f.tried && (f.rating ?? 0) > 0)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    const lines = [`🍜 Меню поездки «${trip?.settings.title ?? ""}»`, ""];
    if (todo.length) {
      lines.push("Хочу попробовать:");
      todo.forEach((f) => lines.push(`• ${f.name}${f.city ? ` — ${f.city}` : ""}`));
      lines.push("");
    }
    if (best.length) {
      lines.push("Топ вкусов:");
      best.slice(0, 5).forEach((f, i) => lines.push(`${MEDALS[i] ?? "⭐"} ${f.name} — ★${f.rating}`));
    }
    const text = lines.join("\n");
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Меню скопировано в буфер");
      } catch {
        toast.error("Не удалось поделиться меню");
      }
    };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Меню поездки", text });
        return;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
    await copy();
  };

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-orange-500 via-rose-500 to-pink-500 p-5 text-center text-white shadow-xl">
          <div className="mb-3 text-5xl">🍜</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="mt-1 text-sm text-white/80">Создай или выбери поездку</p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-4 min-h-11 rounded-xl bg-white/20 px-4 py-3 text-sm font-medium backdrop-blur active:scale-95"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (tripError) {
    return (
      <div className="space-y-2 py-16 text-center text-muted-foreground">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <button
          type="button"
          onClick={() => refetchTrip()}
          className="mt-2 min-h-11 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground"
        >
          Обновить
        </button>
      </div>
    );
  }
  if (foodsError) {
    return (
      <div className="space-y-2 py-16 text-center text-muted-foreground">
        <div className="text-3xl">🍽️</div>
        <p className="text-sm font-medium">Не удалось загрузить блюда</p>
        <button
          type="button"
          onClick={() => refetchFoods()}
          className="mt-2 min-h-11 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (isLoading && !foods) {
    return <FoodSkeleton />;
  }

  const hasFoods = totalCount > 0;
  const hasFilter = cityFilter !== "all" || status !== "all" || query.trim() !== "";

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Герой: подача */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-rose-500 to-pink-500 p-5 text-white shadow-xl">
        <div className="absolute -bottom-6 -right-4 select-none text-[120px] opacity-15 leading-none">🍜</div>
        <div className="relative">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-white/75">
                <UtensilsCrossed className="size-3.5 shrink-0" /> Меню поездки
              </div>
              <h1 className="mt-1 text-2xl font-bold">Что попробовать</h1>
              <p className="mt-1 text-sm text-white/85">
                {totalCount > 0 ? (
                  <>
                    Попробовали <b className="tabular-nums">{triedCount}</b> из{" "}
                    <b className="tabular-nums">{totalCount}</b>
                    {votesTotal > 0 && (
                      <span className="text-white/70">
                        {" "}
                        · 🔥 {votesTotal} {plural(votesTotal, "голос", "голоса", "голосов")} «хочу»
                      </span>
                    )}
                  </>
                ) : (
                  "Гастрогид вашей компании"
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={shareMenu}
              disabled={totalCount === 0}
              aria-label="Поделиться меню"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 backdrop-blur transition-transform active:scale-95 disabled:opacity-40"
            >
              <Share2 className="size-4" />
            </button>
          </div>
          {totalCount > 0 && (
            <div className="mt-3 h-1.5 max-w-[240px] overflow-hidden rounded-full bg-white/20">
              {/* CSS-transition вместо motion: не зависит от rAF (встроенные браузеры мессенджеров его душат) */}
              <div
                className="h-full rounded-full bg-white transition-[width] duration-700 ease-out"
                style={{ width: `${(triedCount / totalCount) * 100}%` }}
              />
            </div>
          )}
          {/* ИИ-подборки: пакет блюд шефа + реальные заведения OSM рядом с днём */}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setPackOpen(true)}
              className="flex-1 min-h-11 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur px-3 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors active:scale-[0.98]"
            >
              <Sparkles className="size-4" /> Подборка шефа
            </button>
            <button
              type="button"
              onClick={() => setRestaurantsOpen(true)}
              className="flex-1 min-h-11 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur px-3 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors active:scale-[0.98]"
            >
              <MapPin className="size-4" /> Рестораны рядом
            </button>
          </div>
        </div>
      </div>

      {/* Топ вкусов: лучшие оценки компании */}
      {topRated.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2 px-1">
            <Trophy className="size-4 self-center text-amber-500" />
            <h2 className="text-sm font-semibold">Топ вкусов</h2>
            <span className="text-xs text-muted-foreground">по оценкам компании</span>
          </div>
          <div className="chip-rail no-scrollbar">
            {topRated.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSheetId(f.id)}
                aria-label={`Открыть ${f.name}, оценка ${f.rating} из 5`}
                className="flex w-44 shrink-0 items-center gap-2.5 rounded-2xl border border-border bg-card p-2 text-left transition-transform active:scale-[0.98]"
              >
                {f.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.imageUrl} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-xl">
                    {f.emoji || "🍽️"}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="flex items-center gap-1">
                    {i < 3 && <span className="text-xs">{MEDALS[i]}</span>}
                    <span className="truncate text-xs font-semibold leading-tight">{f.name}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-0.5 text-[11px] font-semibold text-amber-600">
                    <Star className="size-3 fill-amber-400 text-amber-400" /> {f.rating}/5
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {totalCount > 0 && (
        <>
          {/* Поиск */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти блюдо или место…"
              aria-label="Поиск по блюдам"
              className="w-full rounded-xl border border-input bg-card py-2.5 pl-9 pr-10 text-sm input-mobile"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Очистить поиск"
                className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Статус: все / попробовать / попробовал */}
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { key: "all", label: "Все", emoji: "✨", count: totalCount },
                { key: "todo", label: "Попробовать", emoji: "⏳", count: todoCount },
                { key: "tried", label: "Попробовал", emoji: "✓", count: triedCount },
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStatus(s.key)}
                aria-label={`Фильтр: ${s.label}, ${s.count}`}
                aria-pressed={status === s.key}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors",
                  status === s.key ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-accent"
                )}
              >
                <span>{s.emoji}</span> {s.label}
                <span className={cn("tabular-nums", status === s.key ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {s.count}
                </span>
              </button>
            ))}
          </div>

          {/* Города */}
          {foodCities.length > 1 && (
            <div className="chip-rail no-scrollbar">
              <button
                type="button"
                onClick={() => setCityFilter("all")}
                aria-label="Все города"
                aria-pressed={cityFilter === "all"}
                className={cn(
                  "min-h-11 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  cityFilter === "all" ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-accent"
                )}
              >
                Все города
              </button>
              {foodCities.map((c) => {
                const color = cityColorOf(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCityFilter(c)}
                    aria-label={`Фильтр: ${c}`}
                    aria-pressed={cityFilter === c}
                    className={cn(
                      "flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      cityFilter === c ? "text-white" : "border border-border bg-card hover:bg-accent"
                    )}
                    style={cityFilter === c ? { background: color } : undefined}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: cityFilter === c ? "#fff" : color }} />
                    {c}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Кнопка добавления блюда */}
      <AddFoodButton onClick={() => setAddOpen(true)} />

      {/* Меню по городам */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Загрузка блюд…
        </div>
      ) : grouped.length === 0 ? (
        hasFoods && hasFilter ? (
          <div className="space-y-2 rounded-2xl border-2 border-dashed border-border py-12 text-center">
            <div className="text-3xl">🔍</div>
            <p className="text-sm text-muted-foreground">Ничего не найдено</p>
            <button
              type="button"
              onClick={() => {
                setCityFilter("all");
                setStatus("all");
                setQuery("");
              }}
              className="mt-2 min-h-11 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground"
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          !hasFoods && (
            <div className="space-y-2 rounded-2xl border-2 border-dashed border-border py-12 text-center">
              <div className="text-3xl">🍽️</div>
              <p className="text-sm font-medium text-muted-foreground">Меню пока пустое</p>
              <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                Добавьте блюда, которые хочется попробовать: чек-лист, фото и оценки помогут вспомнить лучшее
              </p>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="mt-2 min-h-11 rounded-xl bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground"
              >
                Добавить первое блюдо
              </button>
            </div>
          )
        )
      ) : (
        <div className="space-y-5">
          {grouped.map(([cityKey, items]) => {
            const color = cityColorOf(cityKey);
            const dayNum = cityDayNumber.get(cityKey);
            return (
              <div key={cityKey}>
                {/* Заголовок города — «глава меню» */}
                <div className="sticky sticky-under-shell z-10 mb-2 flex items-center gap-2 rounded-lg bg-background/80 py-1 backdrop-blur-sm">
                  <div
                    className="grid size-7 place-items-center rounded-lg text-xs font-bold text-white"
                    style={{ background: color }}
                  >
                    {cityKey[0]}
                  </div>
                  <div className="text-sm font-semibold">{cityKey}</div>
                  <div className="text-xs text-muted-foreground">
                    {items.length} {plural(items.length, "блюдо", "блюда", "блюд")}
                  </div>
                  {dayNum && (
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      День {dayNum}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {/* Без AnimatePresence/exit: в webview без rAF exit-анимации
                      не завершаются и «зависшие» карточки остаются в DOM */}
                  {items.map((food) => (
                    <FoodCard
                      key={food.id}
                      food={food}
                      color={color}
                      dayNumber={dayNum}
                      currentUserId={currentUserId}
                      participants={participants}
                      onOpen={() => setSheetId(food.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalCount > 0 && (
        <p className="px-1 text-[11px] text-muted-foreground">
          «Попробовали» — общее для всей компании · тап по блюду открывает карточку с редактированием
        </p>
      )}

      {/* Шторки */}
      <FoodSheet
        food={sheetFood}
        open={!!sheetFood}
        onOpenChange={(v) => !v && setSheetId(null)}
        dayCities={dayCityOrder}
        priceSym={priceSym}
        participants={participants}
        currentUserId={currentUserId}
      />
      <AddFoodSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        dayCities={dayCityOrder}
        priceSym={priceSym}
        defaultCity={cityFilter !== "all" ? cityFilter : undefined}
      />
      <FoodPackSheet
        open={packOpen}
        onClose={() => setPackOpen(false)}
        city={dayCityOrder[0] || ""}
        cities={dayCityOrder}
        existingNames={(foods ?? []).map((f) => f.name)}
        onAdded={() => void refetchFoods()}
      />
      <FoodRestaurantsSheet
        open={restaurantsOpen}
        onClose={() => setRestaurantsOpen(false)}
        days={(days ?? []).map((d) => ({ id: d.id, dayNumber: d.dayNumber, city: d.city }))}
        onAdded={() => {}}
      />
    </div>
  );
}

/* ─── Карточка блюда: строка живого меню ─────────────────────────────── */

function FoodCard({
  food,
  color,
  dayNumber,
  currentUserId,
  participants,
  onOpen,
}: {
  food: FoodItem;
  color: string;
  dayNumber?: number;
  currentUserId: string;
  participants: ParticipantLite[];
  onOpen: () => void;
}) {
  const update = useUpdateFood();
  const voters = parseWantedBy(food);
  const iWant = !!currentUserId && voters.includes(currentUserId);
  const participantById = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

  const toggleTried = () => {
    update.mutate(
      { id: food.id, tried: !food.tried },
      {
        onSuccess: () => {
          toast(food.tried ? "Убрано из попробованных" : "Отмечено как попробованное! 🍽️", {
            description: food.name,
          });
        },
        onError: (err) => {
          toast.error("Не удалось обновить", {
            description: err instanceof Error ? err.message : "Попробуйте ещё раз",
          });
        },
      }
    );
  };

  const toggleWant = () => {
    if (!currentUserId) return;
    update.mutate(
      { id: food.id, want: !iWant },
      {
        onError: (err) => {
          toast.error("Не удалось проголосовать", {
            description: err instanceof Error ? err.message : "Попробуйте ещё раз",
          });
        },
      }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Открыть блюдо ${food.name}`}
      className={cn(
        "relative cursor-pointer overflow-hidden rounded-2xl border p-3 transition-all active:scale-[0.99]",
        food.tried ? "border-green-500/30 bg-green-500/5" : "border-border bg-card hover:border-primary/40"
      )}
    >
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: food.tried ? "#22c55e" : color }} />
      <div className="ml-1 flex items-start gap-3">
        {/* Фото со штампом «пробовано» */}
        <div className="relative size-16 shrink-0">
          {food.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={food.imageUrl} alt="" className="size-16 rounded-xl object-cover" />
          ) : (
            <div className="grid size-16 place-items-center rounded-xl bg-orange-500/10 text-3xl">
              {food.emoji || "🍽️"}
            </div>
          )}
          {food.tried && (
            <div className="absolute -left-1 top-1 -rotate-12 rounded border border-green-600/50 bg-background/85 px-1 text-[7px] font-black uppercase tracking-[0.15em] text-green-600 shadow-sm">
              Пробовано
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* Меню-строка: название ······ цена */}
          <div className="flex items-baseline gap-1.5">
            <h3 className="truncate text-sm font-semibold leading-tight">{food.name}</h3>
            {food.price && (
              <>
                <span aria-hidden className="mx-0.5 min-w-3 flex-1 -translate-y-[3px] self-center border-b border-dotted border-muted-foreground/40" />
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{food.price}</span>
              </>
            )}
          </div>
          {food.nameCn && <div className="truncate text-xs text-muted-foreground">{food.nameCn}</div>}
          {food.description && (
            <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground">{food.description}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {food.place && (
              <span className="flex items-center gap-0.5">
                <MapPin className="size-2.5" /> {food.place}
              </span>
            )}
            {dayNumber && <span>День {dayNumber}</span>}
          </div>

          {/* Действия под карточкой */}
          <div className="mt-2 flex items-center gap-1.5">
            {!food.tried && voters.length > 0 && (
              <span className="flex items-center" aria-label={`Хотят попробовать: ${voters.length}`}>
                {voters.slice(0, 3).map((v, i) => {
                  const p = participantById.get(v);
                  return (
                    <span
                      key={v}
                      title={p?.name ?? "Участник"}
                      className={cn("grid size-5 place-items-center rounded-full text-[9px] ring-2 ring-card", i > 0 && "-ml-1.5")}
                      style={{ background: `${p?.color ?? "#94a3b8"}33` }}
                    >
                      {p?.emoji ?? "👤"}
                    </span>
                  );
                })}
                {voters.length > 3 && (
                  <span className="-ml-1 text-[10px] font-medium text-muted-foreground">+{voters.length - 3}</span>
                )}
              </span>
            )}
            {!food.tried && currentUserId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleWant();
                }}
                disabled={update.isPending}
                aria-pressed={iWant}
                aria-label={iWant ? "Убрать голос «хочу»" : "Голоснуть «хочу попробовать»"}
                className={cn(
                  "flex min-h-9 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-50",
                  iWant ? "bg-orange-500 text-white shadow-sm" : "border border-orange-500/50 text-orange-500"
                )}
              >
                <Flame className="size-3" />
                {voters.length > 0 ? (
                  <span className="tabular-nums">
                    {voters.length} {plural(voters.length, "хочет", "хотят", "хотят")}
                  </span>
                ) : (
                  "Хочу!"
                )}
              </button>
            )}
            {food.tried && (food.rating ?? 0) > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-1 text-[11px] font-semibold text-amber-600">
                <Star className="size-3 fill-amber-400 text-amber-400" />
                <span className="tabular-nums">{food.rating}</span>
              </span>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleTried();
              }}
              disabled={update.isPending}
              aria-label={food.tried ? "Убрать из попробованных" : "Отметить как попробованное"}
              aria-pressed={food.tried}
              className="grid min-h-11 min-w-11 place-items-center rounded-lg disabled:opacity-50"
            >
              {food.tried ? (
                <CheckCircle2 className="size-6 text-green-500" />
              ) : (
                <Circle className="size-6 text-muted-foreground/60 transition-colors hover:text-primary" />
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Кнопка добавления + скелет загрузки ────────────────────────────── */

function AddFoodButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Добавить блюдо"
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-3 transition-colors hover:border-primary hover:text-primary active:scale-[0.99]"
    >
      <Plus className="size-5" />
      <span className="text-sm font-medium">Добавить блюдо</span>
    </button>
  );
}

function FoodSkeleton() {
  return (
    <div className="space-y-4 pb-20">
      <div className="h-36 animate-pulse rounded-3xl bg-muted" />
      <div className="h-11 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-3 gap-1.5">
        <div className="h-11 animate-pulse rounded-lg bg-muted" />
        <div className="h-11 animate-pulse rounded-lg bg-muted" style={{ animationDelay: "80ms" }} />
        <div className="h-11 animate-pulse rounded-lg bg-muted" style={{ animationDelay: "160ms" }} />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-2xl bg-muted"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}
