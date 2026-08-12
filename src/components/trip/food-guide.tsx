"use client";

import { useFoods, useUpdateFood, useUploadFoodPhoto, useAddFood, useDeleteFood, type FoodItem } from "@/hooks/use-trip";
import { useDays, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import { UtensilsCrossed, Star, MapPin, CheckCircle2, Circle, Loader2, Camera, X, Plus, Trash2 } from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useTripStore } from "@/lib/trip-store";
import { currencySymbol } from "@/lib/currencies";

export function FoodGuide() {
  const tripId = useCurrentTripId();
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [showTried, setShowTried] = useState<"all" | "tried" | "todo">("all");
  const { data: foods, isLoading, error: foodsError, refetch: refetchFoods } = useFoods();
  const { data: trip, error: tripError, refetch: refetchTrip } = useTrip();
  const { setTripSwitcherOpen } = useTripStore();
  const priceSym = currencySymbol(trip?.settings?.currency || "USD");

  // Динамический список городов из еды (не захардкоженный China)
  const foodCities = useMemo(() => {
    if (!foods) return [];
    const cities = new Map<string, { name: string; color: string }>();
    foods.forEach((f) => {
      if (!cities.has(f.city)) {
        cities.set(f.city, { name: f.city, color: "#f97316" });
      }
    });
    return Array.from(cities.entries()).map(([key, val]) => ({ key, name: val.name, color: val.color }));
  }, [foods]);

  const filtered = useMemo(() => {
    if (!foods) return [];
    let result = foods;
    if (cityFilter !== "all") {
      result = result.filter((f) => f.city === cityFilter);
    }
    if (showTried === "tried") return result.filter((f) => f.tried);
    if (showTried === "todo") return result.filter((f) => !f.tried);
    return result;
  }, [foods, showTried, cityFilter]);

  const triedCount = foods?.filter((f) => f.tried).length ?? 0;
  const totalCount = foods?.length ?? 0;

  // Группировка по городам
  const grouped = useMemo(() => {
    const map = new Map<string, FoodItem[]>();
    filtered.forEach((f) => {
      const arr = map.get(f.city) ?? [];
      arr.push(f);
      map.set(f.city, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 via-rose-500 to-pink-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">🍜</div>
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
  if (foodsError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🍽️</div>
        <p className="text-sm font-medium">Не удалось загрузить блюда</p>
        <button
          type="button"
          onClick={() => refetchFoods()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (isLoading && !foods) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Загрузка блюд…
      </div>
    );
  }

  // P1 #4: различаем empty cases
  const hasFoods = (foods?.length ?? 0) > 0;
  const hasFilter = cityFilter !== "all" || showTried !== "all";

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 via-rose-500 to-pink-500 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-4 text-[120px] opacity-15 select-none leading-none">🍜</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <UtensilsCrossed className="size-4" /> Гастрономический гид
          </div>
          <h1 className="text-2xl font-bold">Что попробовать</h1>
          <p className="text-white/80 text-sm mt-1">
            Обязательные блюда поездки
            {trip?.settings.title && <span className="text-white/60"> · {trip.settings.title}</span>}
          </p>
          <div className="flex gap-4 mt-3">
            <div>
              <div className="text-2xl font-bold tabular-nums">{triedCount}/{totalCount}</div>
              <div className="text-xs text-white/70">попробовано</div>
            </div>
          </div>
          {totalCount > 0 && (
            <div className="mt-2 h-1.5 rounded-full bg-white/20 overflow-hidden max-w-[200px]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${totalCount > 0 ? (triedCount / totalCount) * 100 : 0}%` }}
                className="h-full rounded-full bg-white"
              />
            </div>
          )}
        </div>
      </div>

      {totalCount > 0 && (
        <p className="text-[11px] text-muted-foreground px-1">
          «Попробовано» общее для всей компании (последнее изменение побеждает)
        </p>
      )}

      {/* Фильтры */}
      <div className="space-y-2">
        {/* Города — динамически из еды */}
        {foodCities.length > 0 && (
          <div className="chip-rail no-scrollbar">
            <button
              onClick={() => setCityFilter("all")}
              aria-label="Все города"
              className={cn(
                "min-h-11 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                cityFilter === "all" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
              )}
            >
              Все города
            </button>
            {foodCities.map((c) => (
              <button
                key={c.key}
                onClick={() => setCityFilter(c.key)}
                aria-label={`Фильтр: ${c.name}`}
                className={cn(
                  "min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                  cityFilter === c.key ? "text-white" : "bg-card border border-border hover:bg-accent"
                )}
                style={cityFilter === c.key ? { background: c.color } : undefined}
              >
                <span className="size-1.5 rounded-full" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Статус */}
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { key: "all", label: "Все", emoji: "✨" },
            { key: "todo", label: "Попробовать", emoji: "⏳" },
            { key: "tried", label: "Попробовал", emoji: "✓" },
          ] as const).map((s) => (
            <button
              key={s.key}
              onClick={() => setShowTried(s.key)}
              aria-label={`Фильтр: ${s.label}`}
              aria-pressed={showTried === s.key}
              className={cn(
                "min-h-11 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors",
                showTried === s.key ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
              )}
            >
              <span>{s.emoji}</span> {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Кнопка добавить блюдо */}
      <AddFoodButton />

      {/* Список блюд по городам */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Загрузка блюд…
        </div>
      ) : grouped.length === 0 ? (
        // P1 #4: различаем нет блюд vs фильтр пуст
        hasFoods && hasFilter ? (
          <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-2">
            <div className="text-3xl">🔍</div>
            <p className="text-sm text-muted-foreground">Ничего не найдено</p>
            <button
              onClick={() => { setCityFilter("all"); setShowTried("all"); }}
              className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
            >
              Сбросить фильтр
            </button>
          </div>
        ) : !hasFoods ? (
          <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-2">
            <div className="text-3xl">🍽️</div>
            <p className="text-sm font-medium text-muted-foreground">Пока нет блюд</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Добавьте блюда, которые хотите попробовать — чек-лист, фото и оценки помогут вспомнить лучшее
            </p>
          </div>
        ) : null
      ) : (
        <div className="space-y-5">
          {grouped.map(([cityKey, items]) => {
            const city = foodCities.find((c) => c.key === cityKey);
            return (
              <div key={cityKey}>
                {/* Заголовок города — P2 #10: sticky top fix */}
                <div className="flex items-center gap-2 mb-2 sticky sticky-under-shell z-10 py-1 bg-background/80 backdrop-blur-sm rounded-lg">
                  <div
                    className="size-7 rounded-lg grid place-items-center text-white text-xs font-bold"
                    style={{ background: city?.color ?? "#f97316" }}
                  >
                    {cityKey[0]}
                  </div>
                  <div className="text-sm font-semibold">{cityKey}</div>
                  <div className="text-xs text-muted-foreground">{items.length} блюд</div>
                </div>

                {/* Карточки блюд */}
                <div className="space-y-2">
                  <AnimatePresence>
                    {items.map((food) => (
                      <FoodCard key={food.id} food={food} cityColor={city?.color ?? "#f97316"} priceSym={priceSym} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FoodCard({ food, cityColor, priceSym }: { food: FoodItem; cityColor: string; priceSym: string }) {
  const update = useUpdateFood();
  const upload = useUploadFoodPhoto();
  const del = useDeleteFood();
  const inputRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // P1 #5: toggle/rating с try/catch, toast в onSuccess (не сразу)
  const toggle = () => {
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

  const setRating = (s: number) => {
    update.mutate(
      { id: food.id, rating: s === food.rating ? null : s },
      {
        onError: (err) => {
          toast.error("Не удалось сохранить оценку", {
            description: err instanceof Error ? err.message : "Попробуйте ещё раз",
          });
        },
      }
    );
  };

  // P1 #5: upload try/catch
  const onFile = async (f: File) => {
    try {
      await upload.mutateAsync({ id: food.id, file: f });
      toast.success("Фото блюда добавлено 📸");
    } catch (err) {
      toast.error("Не удалось загрузить фото", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  // P0 #1: delete с confirm + try/catch + toast onSuccess
  const handleDelete = async () => {
    try {
      await del.mutateAsync(food.id);
      toast.success("Удалено");
      setConfirmingDelete(false);
    } catch (err) {
      toast.error("Не удалось удалить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        "group rounded-2xl border p-3.5 transition-colors relative overflow-hidden",
        food.tried ? "bg-green-500/5 border-green-500/30" : "bg-card border-border"
      )}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: food.tried ? "#22c55e" : cityColor }}
      />
      <div className="flex items-start gap-3 ml-1">
        {/* Фото блюда или эмодзи */}
        <div className="shrink-0 relative group">
          {food.imageUrl ? (
            <button
              onClick={() => setLightbox(true)}
              aria-label={`Показать фото: ${food.name}`}
              className="size-16 rounded-xl overflow-hidden bg-muted block"
            >
              <img src={food.imageUrl} alt={food.name} className="w-full h-full object-cover" />
            </button>
          ) : (
            <div className="size-16 rounded-xl grid place-items-center text-3xl bg-orange-500/10">
              {food.emoji || "🍽️"}
            </div>
          )}
          {/* Кнопка загрузки фото */}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
            aria-label={food.imageUrl ? "Заменить фото" : "Добавить фото"}
            className={cn(
              "absolute -bottom-1 -right-1 size-6 rounded-full grid place-items-center shadow-md transition-transform active:scale-90 disabled:opacity-50",
              food.imageUrl ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-primary"
            )}
            title={food.imageUrl ? "Заменить фото" : "Добавить фото"}
          >
            {upload.isPending ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3" />}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>

        <div className="min-w-0 flex-1">
          {/* Название */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className={cn("font-semibold text-sm leading-tight", food.tried && "line-through opacity-60")}>
                {food.name}
              </h3>
              {food.nameCn && (
                <span className="text-xs text-muted-foreground">{food.nameCn}</span>
              )}
            </div>
            <button
              onClick={toggle}
              disabled={update.isPending}
              aria-label={food.tried ? "Убрать из попробованных" : "Отметить как попробованное"}
              aria-pressed={food.tried}
              className="shrink-0 disabled:opacity-50"
            >
              {food.tried ? (
                <CheckCircle2 className="size-5 text-green-500" />
              ) : (
                <Circle className="size-5 text-muted-foreground hover:text-primary transition-colors" />
              )}
            </button>
          </div>

          {/* Описание */}
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
            {food.description}
          </p>

          {/* Детали */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {food.place && (
              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <MapPin className="size-2.5" /> {food.place}
              </span>
            )}
            {food.price && (
              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <span className="font-medium">{priceSym}</span> {food.price}
              </span>
            )}
          </div>

          {/* Рейтинг (показываем если пробовали) */}
          {food.tried && (
            <div className="flex items-center gap-1 mt-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setRating(s)}
                  disabled={update.isPending}
                  aria-label={`Оценить на ${s} звёзд`}
                  className="p-1 -m-1 active:scale-90 transition-transform disabled:opacity-50"
                >
                  <Star
                    className={cn(
                      "size-7 sm:size-6 transition-transform",
                      (food.rating ?? 0) >= s ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                    )}
                  />
                </button>
              ))}
              {food.rating && (
                <span className="text-xs text-muted-foreground ml-1.5 font-medium">{food.rating}/5</span>
              )}
            </div>
          )}

          {/* P0 #1: Delete button with confirm — видно на mobile (не только group-hover) */}
          <div className="mt-2 flex justify-end">
            {confirmingDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={del.isPending}
                  aria-label="Подтвердить удаление"
                  className="btn-confirm-yes"
                >
                  {del.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
                  {del.isPending ? "…" : "Да"}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={del.isPending}
                  aria-label="Отменить удаление"
                  className="btn-confirm-no"
                >
                  Нет
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                aria-label="Удалить блюдо"
                className="size-11 rounded-lg hover:bg-red-500/10 hover:text-red-500 grid place-items-center transition-opacity text-muted-foreground"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox для фото — через портал чтобы избежать stacking context */}
      {lightbox && food.imageUrl && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button className="absolute top-4 right-4 size-10 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20 z-10" aria-label="Закрыть">
            <X className="size-5" />
          </button>
          <img
            src={food.imageUrl}
            alt={food.name}
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="mt-4 text-white text-sm font-medium text-center">
            {food.name}
            {food.nameCn && <span className="text-white/60 ml-2">{food.nameCn}</span>}
          </div>
        </div>,
        document.body
      )}
    </motion.div>
  );
}

// Кнопка добавления нового блюда
function AddFoodButton() {
  const { data: days } = useDays();
  const { data: trip } = useTrip();
  const addFood = useAddFood();
  const priceSym = currencySymbol(trip?.settings?.currency || "USD");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameCn, setNameCn] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [place, setPlace] = useState("");
  const [price, setPrice] = useState("");
  const [emoji, setEmoji] = useState("🍽️");

  useBodyScrollLock(open);

  // P1 #5: try/catch — не чистим форму при fail
  const submit = async () => {
    if (!name.trim() || !city.trim()) {
      toast.error("Название и город обязательны");
      return;
    }
    try {
      await addFood.mutateAsync({
        name: name.trim(),
        nameCn: nameCn.trim() || undefined,
        description: description.trim() || undefined,
        city: city.trim(),
        place: place.trim() || undefined,
        price: price.trim() || undefined,
        emoji,
      });
      toast.success("Блюдо добавлено! 🍽️");
      setName(""); setNameCn(""); setDescription(""); setCity(""); setPlace(""); setPrice(""); setEmoji("🍽️");
      setOpen(false);
    } catch (err) {
      toast.error("Не удалось добавить блюдо", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
      // НЕ чистим форму — пусть пользователь видит что ввёл
    }
  };

  const EMOJIS = ["🍽️", "🍜", "🥟", "🍣", "🍕", "🍔", "🥘", "🍲", "🌮", "🥗", "🍖", "🦆", "🍤", "🥩", "🍛", "🧆", "🥙", "🍰", "🧋", "🍺"];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Добавить блюдо"
        className="w-full min-h-[48px] flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors"
      >
        <Plus className="size-5" />
        <span className="text-sm font-medium">Добавить блюдо</span>
      </button>
    );
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-y-auto max-h-[90vh]"
        >
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2">
              <UtensilsCrossed className="size-5 text-primary" /> Новое блюдо
            </h2>
            <button onClick={() => setOpen(false)} aria-label="Закрыть" className="size-11 rounded-full hover:bg-accent grid place-items-center">
              <X className="size-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            {/* Эмодзи */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Иконка</label>
              <div className="flex gap-1.5 flex-wrap">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(e)}
                    aria-label={`Иконка ${e}`}
                    aria-pressed={emoji === e}
                    className={cn(
                      "min-h-11 size-11 rounded-lg text-xl grid place-items-center transition-all",
                      emoji === e ? "bg-primary/20 ring-2 ring-primary scale-110" : "bg-muted hover:bg-accent"
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Название *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Пельмени"
                autoFocus
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              {/* P1 #7: нейтральный placeholder (был 点心) и label (был «Местное название») */}
              <label className="text-xs text-muted-foreground mb-1 block">Оригинальное название</label>
              <input
                value={nameCn}
                onChange={(e) => setNameCn(e.target.value)}
                placeholder="На местном языке"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Город *</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Выберите из списка или введите"
                list="food-cities"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              />
              <datalist id="food-cities">
                {days?.map((d) => (
                  <option key={d.id} value={d.city} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Где попробовать</label>
                <input
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="Ресторан"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Цена</label>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={`напр. ${priceSym}5–10`}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Что это, вкус, стоит ли пробовать…"
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm resize-none"
              />
            </div>
            <button
              onClick={submit}
              disabled={addFood.isPending}
              className="w-full min-h-[48px] rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {addFood.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {addFood.isPending ? "Добавление…" : "Добавить блюдо"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
