"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { CheckCircle2, MapPin, Navigation, Plus, Star, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { WishlistItem } from "./types";
import { loadWishlist, saveWishlist, migrateLegacyWishlist } from "@/lib/wishlist";
import { useCurrentTripId } from "@/hooks/use-trip";

const CATS = [
  { key: "restaurant", emoji: "🍽️", label: "Ресторан" },
  { key: "cafe", emoji: "☕", label: "Кафе" },
  { key: "bar", emoji: "🍸", label: "Бар" },
  { key: "other", emoji: "✨", label: "Другое" },
];

export function WishlistView({ onGoNearby }: { onGoNearby?: () => void }) {
  const tripId = useCurrentTripId();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("restaurant");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [items, setItems] = useState<WishlistItem[]>([]);
  // Свежий state для undo внутри тоста (closure в toast живёт дольше рендера)
  const itemsRef = useRef<WishlistItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!tripId) {
      setItems([]);
      return;
    }
    const migrated = migrateLegacyWishlist(tripId);
    setItems(migrated ?? loadWishlist(tripId));
  }, [tripId]);

  const save = (newItems: WishlistItem[]) => {
    setItems(newItems);
    saveWishlist(newItems, tripId);
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

  const setRating = (id: string, rating: number) => {
    save(items.map(i => i.id === id ? { ...i, rating: i.rating === rating ? null : rating } : i));
  };

  // Удаление сразу, но с возможностью вернуть — вместо молчаливой потери
  const deleteItem = (item: WishlistItem) => {
    const idx = items.findIndex(i => i.id === item.id);
    save(items.filter(i => i.id !== item.id));
    toast("Удалено из списка", {
      description: item.name,
      duration: 6000,
      action: {
        label: "Вернуть",
        onClick: () => {
          const current = itemsRef.current;
          const next = [...current];
          next.splice(Math.min(idx, next.length), 0, item);
          save(next);
        },
      },
    });
  };

  // Непосещённые сверху, посещённые — ниже (порядок внутри групп сохраняется)
  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(a.visited) - Number(b.visited)),
    [items]
  );

  const stats = useMemo(() => ({
    total: items.length,
    visited: items.filter(i => i.visited).length,
  }), [items]);

  return (
    <div className="space-y-3">
      {/* Честный copy: wishlist живёт только в localStorage этого устройства */}
      <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 flex items-center gap-1.5">
        <span aria-hidden="true">📱</span>
        <span>
          Хранится только на этом телефоне — не виден компании.{" "}
          <span className="font-medium text-foreground/70">
            {stats.visited}/{stats.total}
          </span>{" "}
          отмечено
        </span>
      </div>

      {/* Форма добавления: Enter — добавить, Escape — отмена */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="size-5" />
          <span className="text-sm font-medium">Добавить место</span>
        </button>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); addItem(); }}
          onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }}
          className="bg-card border border-border rounded-2xl p-3 space-y-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название места *"
            autoFocus
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
          />
          <div className="flex gap-1.5 flex-wrap">
            {CATS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                aria-pressed={category === c.key}
                className={cn(
                  "min-h-11 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
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
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Заметка (необязательно)"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="flex-1 min-h-11 rounded-lg bg-secondary py-2.5 text-sm font-medium"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 min-h-11 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium flex items-center justify-center gap-1"
            >
              <Plus className="size-4" /> Добавить
            </button>
          </div>
        </form>
      )}

      {/* Список */}
      {items.length === 0 && !adding ? (
        <div className="text-center py-12 text-muted-foreground text-sm space-y-3">
          <Star className="size-8 mx-auto opacity-30" />
          <p>Список пуст. Добавляй места, куда хочется зайти.</p>
          <p className="text-xs text-muted-foreground">Нашли что-то рядом прямо сейчас?</p>
          {onGoNearby && (
            <button
              onClick={onGoNearby}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
            >
              <Navigation className="size-3.5" /> Посмотреть, что рядом
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => {
            const cat = CATS.find(c => c.key === item.category);
            const hasCoords = typeof item.lat === "number" && typeof item.lng === "number";
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl bg-card border border-border p-3 flex items-start gap-3 transition-all",
                  item.visited && "opacity-60 bg-green-500/5 border-green-500/20"
                )}
              >
                <button
                  onClick={() => toggleVisited(item.id)}
                  aria-label={item.visited ? "Снять отметку «посещено»" : "Отметить как посещённое"}
                  aria-pressed={item.visited}
                  className={cn(
                    "size-11 rounded-full border-2 grid place-items-center shrink-0 mt-0.5 transition-colors",
                    item.visited ? "bg-green-500 border-green-500" : "border-input hover:border-primary"
                  )}
                >
                  {item.visited && <CheckCircle2 className="size-4 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-sm font-medium", item.visited && "line-through")}>
                    {cat?.emoji} {item.name}
                  </div>
                  {(item.address || hasCoords) && (
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                      {item.address && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                          <MapPin className="size-2.5" /> {item.address}
                        </span>
                      )}
                      {hasCoords && (
                        <a
                          href={`https://www.openstreetmap.org/directions?from=&to=${item.lat}%2C${item.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-primary font-medium hover:underline flex items-center gap-0.5"
                        >
                          <Navigation className="size-2.5" /> Как добраться
                        </a>
                      )}
                    </div>
                  )}
                  {item.note && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">{item.note}</div>
                  )}
                  {/* Звёзды оценки — появляются после посещения */}
                  {item.visited && (
                    <div className="flex items-center gap-1 mt-1.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          onClick={() => setRating(item.id, s)}
                          aria-label={`Оценить на ${s} звёзд`}
                          className="p-1 -m-1 active:scale-90 transition-transform"
                        >
                          <Star
                            className={cn(
                              "size-5 transition-transform",
                              (item.rating ?? 0) >= s ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                            )}
                          />
                        </button>
                      ))}
                      {item.rating && (
                        <span className="text-xs text-muted-foreground ml-1.5 font-medium">{item.rating}/5</span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteItem(item)}
                  aria-label={`Удалить ${item.name} из списка`}
                  className="size-11 rounded-lg hover:bg-red-500/10 hover:text-red-500 grid place-items-center text-muted-foreground shrink-0 transition-colors"
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
