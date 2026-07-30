"use client";

import { useFoods, useUpdateFood, useUploadFoodPhoto, type FoodItem } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import { UtensilsCrossed, Star, MapPin, DollarSign, CheckCircle2, Circle, Loader2, Camera, X } from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function FoodGuide() {
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [showTried, setShowTried] = useState<"all" | "tried" | "todo">("all");
  const { data: foods, isLoading } = useFoods();

  // Динамический список городов из еды (не захардкоженный)
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
          <p className="text-white/80 text-sm mt-1">Обязательные блюда поездки</p>
          <div className="flex gap-4 mt-3">
            <div>
              <div className="text-2xl font-bold">{triedCount}/{totalCount}</div>
              <div className="text-xs text-white/70">попробовано</div>
            </div>
          </div>
          {totalCount > 0 && (
            <div className="mt-2 h-1.5 rounded-full bg-white/20 overflow-hidden max-w-[200px]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(triedCount / totalCount) * 100}%` }}
                className="h-full rounded-full bg-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* Фильтры */}
      <div className="space-y-2">
        {/* Города — динамически из еды */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setCityFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              cityFilter === "all" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
            )}
          >
            Все города
          </button>
          {foodCities.map((c) => (
            <button
              key={c.key}
              onClick={() => setCityFilter(c.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                cityFilter === c.key ? "text-white" : "bg-card border border-border hover:bg-accent"
              )}
              style={cityFilter === c.key ? { background: c.color } : undefined}
            >
              <span className="size-1.5 rounded-full" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>

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
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors",
                showTried === s.key ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
              )}
            >
              <span>{s.emoji}</span> {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Список блюд по городам */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Загрузка блюд…
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">Ничего не найдено</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([cityKey, items]) => {
            const city = foodCities.find((c) => c.key === cityKey);
            return (
              <div key={cityKey}>
                {/* Заголовок города */}
                <div className="flex items-center gap-2 mb-2 sticky top-[6.5rem] z-10 py-1">
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
                      <FoodCard key={food.id} food={food} cityColor={city?.color ?? "#f97316"} />
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

function FoodCard({ food, cityColor }: { food: FoodItem; cityColor: string }) {
  const update = useUpdateFood();
  const upload = useUploadFoodPhoto();
  const inputRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState(false);

  const toggle = () => {
    update.mutate({ id: food.id, tried: !food.tried });
    toast(food.tried ? "Убрано из попробованных" : "Отмечено как попробованное! 🍽️", {
      description: food.name,
    });
  };

  const onFile = async (f: File) => {
    await upload.mutateAsync({ id: food.id, file: f });
    toast.success("Фото блюда добавлено 📸");
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        "rounded-2xl border p-3.5 transition-colors relative overflow-hidden",
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
            className={cn(
              "absolute -bottom-1 -right-1 size-6 rounded-full grid place-items-center shadow-md transition-transform active:scale-90",
              food.imageUrl ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-primary"
            )}
            title={food.imageUrl ? "Заменить фото" : "Добавить фото"}
          >
            {upload.isPending ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3" />}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
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
            <button onClick={toggle} className="shrink-0">
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
                <DollarSign className="size-2.5" /> {food.price}
              </span>
            )}
          </div>

          {/* Рейтинг (показываем если пробовали) */}
          {food.tried && (
            <div className="flex items-center gap-0.5 mt-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => update.mutate({ id: food.id, rating: s === food.rating ? null : s })}
                >
                  <Star
                    className={cn(
                      "size-4 transition-transform hover:scale-110",
                      (food.rating ?? 0) >= s ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                    )}
                  />
                </button>
              ))}
              {food.rating && (
                <span className="text-[10px] text-muted-foreground ml-1">{food.rating}/5</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox для фото — через портал чтобы избежать stacking context */}
      {lightbox && food.imageUrl && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button className="absolute top-4 right-4 size-10 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20 z-10">
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
