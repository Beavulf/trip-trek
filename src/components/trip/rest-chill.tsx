"use client";

import { useDays, useUpdatePlace, useNearby, type NearbyPlace } from "@/hooks/use-trip";
import { CATEGORY_META, type Place, type Day } from "@/lib/types";
import { Coffee, Star, MapPin, Clock, CheckCircle2, Circle, Search, Navigation, Loader2, Locate, ListPlus, Plus, X } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; lat: number; lng: number }
  | { status: "denied"; message: string };

function NearbyView({ category, onCategoryChange }: { category: string; onCategoryChange: (c: string) => void }) {
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });

  const enabled = geo.status === "ready";
  const { data, isLoading, error } = useNearby(
    geo.status === "ready" ? geo.lat : null,
    geo.status === "ready" ? geo.lng : null,
    category,
    enabled
  );

  const requestGeo = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setGeo({ status: "denied", message: "Включите геолокацию для поиска мест рядом" });
      return;
    }
    setGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ status: "ready", lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Включите геолокацию для поиска мест рядом"
            : "Не удалось определить местоположение. Попробуйте ещё раз.";
        setGeo({ status: "denied", message });
        toast.error(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  return (
    <div className="space-y-3">
      {/* Категории */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {[
          { key: "all", label: "Все", emoji: "✨" },
          { key: "cafe", label: "Кафе", emoji: "☕" },
          { key: "restaurant", label: "Еда", emoji: "🍽️" },
          { key: "bar", label: "Бары", emoji: "🍸" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => onCategoryChange(f.key)}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              category === f.key ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
            )}
          >
            <span>{f.emoji}</span> {f.label}
          </button>
        ))}
      </div>

      {/* Кнопка геолокации */}
      {geo.status !== "ready" && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card p-4 text-center space-y-2">
          <Locate className="size-6 mx-auto text-muted-foreground" />
          {geo.status === "denied" ? (
            <p className="text-sm text-muted-foreground">{geo.message}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Найдём кафе и рестораны рядом с вами
            </p>
          )}
          <button
            onClick={requestGeo}
            disabled={geo.status === "loading"}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium active:scale-95 transition-transform disabled:opacity-50"
          >
            {geo.status === "loading" ? (
              <><Loader2 className="size-4 animate-spin" /> Определяем местоположение…</>
            ) : (
              <><Locate className="size-4" /> Найти рядом со мной</>
            )}
          </button>
        </div>
      )}

      {geo.status === "ready" && (
        <>
          <p className="text-[11px] text-muted-foreground px-1 flex items-center gap-1">
            📍 Рядом с вами (радиус 1.5 км) · данные OpenStreetMap
            <button
              onClick={requestGeo}
              className="ml-auto text-primary hover:underline shrink-0"
              title="Обновить местоположение"
            >
              Обновить
            </button>
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /> Ищем места поблизости…
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500 text-sm">
              Не удалось загрузить: {error.message}
            </div>
          ) : data?.places && data.places.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {data.places.map((p, i) => (
                <NearbyCard key={i} place={p} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Поблизости ничего не найдено
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NearbyCard({ place }: { place: NearbyPlace }) {
  const [added, setAdded] = useState(false);

  const addToWishlist = () => {
    const saved = localStorage.getItem("triptrek-wishlist");
    let items: WishlistItem[] = [];
    try { items = saved ? JSON.parse(saved) : []; } catch {}

    // Проверяем не добавлено ли уже
    if (items.some(i => i.name === place.name)) {
      toast.info("Уже в списке");
      setAdded(true);
      return;
    }

    const newItem: WishlistItem = {
      id: crypto.randomUUID(),
      name: place.name,
      category: place.category === "restaurant" ? "restaurant" : place.category === "cafe" ? "cafe" : place.category === "bar" ? "bar" : "other",
      address: place.address || undefined,
      note: place.cuisine || undefined,
      visited: false,
    };
    items = [newItem, ...items];
    localStorage.setItem("triptrek-wishlist", JSON.stringify(items));
    setAdded(true);
    toast.success("Добавлено в «Хочу посетить» ⭐");
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-card border border-border p-3 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-2.5">
        <div className="size-10 rounded-xl grid place-items-center text-xl shrink-0 bg-amber-500/10">
          {place.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm leading-tight line-clamp-1">{place.name}</h3>
          {place.cuisine && (
            <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{place.cuisine}</div>
          )}
          {place.address && (
            <div className="flex items-start gap-1 text-[10px] text-muted-foreground mt-0.5">
              <MapPin className="size-2.5 mt-0.5 shrink-0" />
              <span className="line-clamp-1">{place.address}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-primary font-medium flex items-center gap-0.5">
              <Navigation className="size-2.5" /> {place.distance < 1000 ? `${place.distance} м` : `${(place.distance / 1000).toFixed(1)} км`}
            </span>
            <a
              href={`https://www.openstreetmap.org/directions?from=&to=${place.lat}%2C${place.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary hover:underline"
            >
              Как добраться
            </a>
          </div>
          {/* Кнопка добавить в "Хочу посетить" */}
          <button
            onClick={addToWishlist}
            disabled={added}
            className={cn(
              "mt-2 w-full rounded-lg py-1.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors",
              added
                ? "bg-green-500/10 text-green-600"
                : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 active:scale-95"
            )}
          >
            {added ? (
              <><CheckCircle2 className="size-3.5" /> В списке</>
            ) : (
              <><Star className="size-3.5" /> Хочу посетить</>
            )}
          </button>
        </div>
      </div>
    </motion.div>
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

// Хочу посетить — список ресторанов пользователя (localStorage)
interface WishlistItem {
  id: string;
  name: string;
  category: string;
  address?: string;
  note?: string;
  visited: boolean;
}

function WishlistView() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("restaurant");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  // Загружаем из localStorage через lazy initializer
  const [items, setItems] = useState<WishlistItem[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("triptrek-wishlist");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  });

  // Сохраняем в localStorage
  const save = (newItems: WishlistItem[]) => {
    setItems(newItems);
    localStorage.setItem("triptrek-wishlist", JSON.stringify(newItems));
  };

  const addItem = () => {
    if (!name.trim()) {
      toast.error("Введите название");
      return;
    }
    const item: WishlistItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category,
      address: address.trim() || undefined,
      note: note.trim() || undefined,
      visited: false,
    };
    save([item, ...items]);
    toast.success("Добавлено в список! ⭐");
    setName(""); setAddress(""); setNote(""); setCategory("restaurant");
    setAdding(false);
  };

  const toggleVisited = (id: string) => {
    save(items.map(i => i.id === id ? { ...i, visited: !i.visited } : i));
  };

  const deleteItem = (id: string) => {
    save(items.filter(i => i.id !== id));
  };

  const CATS = [
    { key: "restaurant", emoji: "🍽️", label: "Ресторан" },
    { key: "cafe", emoji: "☕", label: "Кафе" },
    { key: "bar", emoji: "🍸", label: "Бар" },
    { key: "other", emoji: "✨", label: "Другое" },
  ];

  return (
    <div className="space-y-3">
      {/* Кнопка добавить */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="size-5" />
          <span className="text-sm font-medium">Добавить место</span>
        </button>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название места *"
            autoFocus
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-1.5 flex-wrap">
            {CATS.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  category === c.key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
                )}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Адрес (необязательно)"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Заметка (необязательно)"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setAdding(false)}
              className="flex-1 rounded-lg bg-secondary py-2.5 text-sm font-medium"
            >
              Отмена
            </button>
            <button
              onClick={addItem}
              className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium flex items-center justify-center gap-1"
            >
              <Plus className="size-4" /> Добавить
            </button>
          </div>
        </div>
      )}

      {/* Список */}
      {items.length === 0 && !adding ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <Star className="size-8 mx-auto mb-2 opacity-30" />
          Список пуст. Добавь места, которые хочешь посетить!
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const cat = CATS.find(c => c.key === item.category);
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl bg-card border border-border p-3 flex items-start gap-3 transition-all",
                  item.visited && "opacity-60"
                )}
              >
                <button
                  onClick={() => toggleVisited(item.id)}
                  className={cn(
                    "size-6 rounded-full border-2 grid place-items-center shrink-0 mt-0.5",
                    item.visited ? "bg-green-500 border-green-500" : "border-input"
                  )}
                >
                  {item.visited && <CheckCircle2 className="size-4 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-sm font-medium", item.visited && "line-through")}>
                    {cat?.emoji} {item.name}
                  </div>
                  {item.address && (
                    <div className="text-[11px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                      <MapPin className="size-2.5" /> {item.address}
                    </div>
                  )}
                  {item.note && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">{item.note}</div>
                  )}
                </div>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="size-7 rounded-lg hover:bg-red-500/10 hover:text-red-500 grid place-items-center text-muted-foreground shrink-0"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
