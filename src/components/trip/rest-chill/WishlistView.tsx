"use client";

import { useState } from "react";
import { CheckCircle2, MapPin, Plus, Star, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { WishlistItem } from "./types";

const CATS = [
  { key: "restaurant", emoji: "🍽️", label: "Ресторан" },
  { key: "cafe", emoji: "☕", label: "Кафе" },
  { key: "bar", emoji: "🍸", label: "Бар" },
  { key: "other", emoji: "✨", label: "Другое" },
];

export function WishlistView() {
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
      } catch { /* ignore */ }
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

  const setRating = (id: string, rating: number) => {
    save(items.map(i => i.id === id ? { ...i, rating: i.rating === rating ? null : rating } : i));
  };

  const deleteItem = (id: string) => {
    save(items.filter(i => i.id !== id));
  };

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
                  {/* Звёзды оценки */}
                  {item.visited && (
                    <div className="flex items-center gap-1 mt-1.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          onClick={() => setRating(item.id, s)}
                          className="p-1 -m-1 active:scale-90 transition-transform"
                        >
                          <Star
                            className={cn(
                              "size-6 transition-transform",
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
