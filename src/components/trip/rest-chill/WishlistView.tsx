"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { CheckCircle2, ChevronRight, MapPin, Navigation, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn, haptic, plural } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
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
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  // Свежий state для undo внутри тоста (closure в toast живёт дольше рендера)
  const itemsRef = useRef<WishlistItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const load = () => {
      if (!tripId) return [];
      const migrated = migrateLegacyWishlist(tripId);
      return migrated ?? loadWishlist(tripId);
    };
    // localStorage — внешняя система: читаем и синхронизируем при смене поездки
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(load());
  }, [tripId]);

  const save = (newItems: WishlistItem[]) => {
    setItems(newItems);
    saveWishlist(newItems, tripId);
  };

  const openAdd = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (item: WishlistItem) => {
    setEditing(item);
    setSheetOpen(true);
  };

  // Добавление или сохранение правок из шторки
  const upsert = (item: WishlistItem) => {
    const exists = items.some((i) => i.id === item.id);
    save(exists ? items.map((i) => (i.id === item.id ? item : i)) : [item, ...items]);
    toast.success(exists ? "Сохранено" : "Добавлено в список! ⭐", { description: item.name });
    setSheetOpen(false);
  };

  const toggleVisited = (id: string) => {
    haptic();
    save(items.map((i) => (i.id === id ? { ...i, visited: !i.visited } : i)));
  };

  const setRating = (id: string, rating: number) => {
    save(items.map((i) => (i.id === id ? { ...i, rating: i.rating === rating ? null : rating } : i)));
  };

  // Удаление сразу, но с возможностью вернуть — вместо молчаливой потери
  const deleteItem = (item: WishlistItem) => {
    const idx = items.findIndex((i) => i.id === item.id);
    save(items.filter((i) => i.id !== item.id));
    setSheetOpen(false);
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

  const unvisited = useMemo(() => items.filter((i) => !i.visited), [items]);
  const visitedItems = useMemo(() => items.filter((i) => i.visited), [items]);

  return (
    <div className="space-y-3">
      {/* Честный copy: wishlist живёт только в localStorage этого устройства */}
      <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 flex items-center gap-1.5">
        <span aria-hidden="true">📱</span>
        <span>
          Хранится только на этом телефоне — не виден компании.{" "}
          <span className="font-medium text-foreground/70">
            {visitedItems.length}/{items.length}
          </span>{" "}
          отмечено
        </span>
      </div>

      {/* Добавление — через мобильную шторку */}
      <button
        onClick={openAdd}
        className="w-full min-h-[44px] flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors"
      >
        <Plus className="size-5" />
        <span className="text-sm font-medium">Добавить место</span>
      </button>

      {/* Список: сначала «Хочу посетить», ниже — «Посетили» */}
      {items.length === 0 ? (
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
        <>
          {unvisited.length > 0 && (
            <WishSection
              title="Хочу посетить"
              count={unvisited.length}
              items={unvisited}
              onToggle={toggleVisited}
              onRate={setRating}
              onOpen={openEdit}
            />
          )}
          {visitedItems.length > 0 && (
            <WishSection
              title="Посетили"
              count={visitedItems.length}
              items={visitedItems}
              onToggle={toggleVisited}
              onRate={setRating}
              onOpen={openEdit}
            />
          )}
        </>
      )}

      {/* Шторка добавления/редактирования — key пересоздаёт форму с чистыми полями */}
      <MobileBottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? "Редактировать место" : "Новое место"}
        titleIcon={<Star className="size-5 text-primary" />}
      >
        <WishForm
          key={editing?.id ?? "new"}
          initial={editing}
          onCancel={() => setSheetOpen(false)}
          onSave={upsert}
          onDelete={deleteItem}
        />
      </MobileBottomSheet>
    </div>
  );
}

function WishSection({
  title,
  count,
  items,
  onToggle,
  onRate,
  onOpen,
}: {
  title: string;
  count: number;
  items: WishlistItem[];
  onToggle: (id: string) => void;
  onRate: (id: string, rating: number) => void;
  onOpen: (item: WishlistItem) => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
        {title === "Посетили" && <CheckCircle2 className="size-3.5 text-green-500" />}
        {title}
        <span className="text-muted-foreground/60 normal-case tracking-normal font-medium">
          {count} {plural(count, "место", "места", "мест")}
        </span>
      </h3>
      <div className="space-y-2">
        {items.map((item) => (
          <WishCard key={item.id} item={item} onToggle={onToggle} onRate={onRate} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function WishCard({
  item,
  onToggle,
  onRate,
  onOpen,
}: {
  item: WishlistItem;
  onToggle: (id: string) => void;
  onRate: (id: string, rating: number) => void;
  onOpen: (item: WishlistItem) => void;
}) {
  const cat = CATS.find((c) => c.key === item.category);
  const hasCoords = typeof item.lat === "number" && typeof item.lng === "number";
  return (
    <div
      className={cn(
        "rounded-xl bg-card border border-border p-3 flex items-start gap-3 transition-all",
        item.visited && "bg-green-500/5 border-green-500/20"
      )}
    >
      <button
        onClick={() => onToggle(item.id)}
        aria-label={item.visited ? "Снять отметку «посещено»" : "Отметить как посещённое"}
        aria-pressed={item.visited}
        className={cn(
          "size-11 rounded-full border-2 grid place-items-center shrink-0 mt-0.5 transition-colors",
          item.visited ? "bg-green-500 border-green-500" : "border-input hover:border-primary"
        )}
      >
        {item.visited && <CheckCircle2 className="size-4 text-white" />}
      </button>
      {/* Тап по содержимому — редактирование в шторке */}
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={`Редактировать ${item.name}`}
        className="flex-1 min-w-0 text-left focus-visible:outline-2 focus-visible:outline-primary rounded-lg"
      >
        <div className={cn("text-sm font-medium flex items-start gap-1", item.visited && "line-through opacity-70")}>
          <span className="shrink-0" aria-hidden="true">
            {cat?.emoji}
          </span>
          <span className="min-w-0 flex-1">{item.name}</span>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 mt-0.5" />
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
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-primary font-medium hover:underline flex items-center gap-0.5"
              >
                <Navigation className="size-2.5" /> Как добраться
              </a>
            )}
          </div>
        )}
        {item.note && <div className="text-[11px] text-muted-foreground mt-0.5">{item.note}</div>}
        {/* Звёзды оценки — появляются после посещения */}
        {item.visited && (
          <div className="flex items-center gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => onRate(item.id, s)}
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
            {item.rating && <span className="text-xs text-muted-foreground ml-1.5 font-medium">{item.rating}/5</span>}
          </div>
        )}
      </button>
    </div>
  );
}

/** Форма шторки: key={editing?.id} гарантирует свежие поля при переключении места */
function WishForm({
  initial,
  onCancel,
  onSave,
  onDelete,
}: {
  initial: WishlistItem | null;
  onCancel: () => void;
  onSave: (item: WishlistItem) => void;
  onDelete: (item: WishlistItem) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "restaurant");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  const submit = () => {
    if (!name.trim()) {
      toast.error("Введите название");
      return;
    }
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      category,
      address: address.trim() || undefined,
      note: note.trim() || undefined,
      visited: initial?.visited ?? false,
      rating: initial?.rating ?? null,
      lat: initial?.lat,
      lng: initial?.lng,
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2.5"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название места *"
        autoFocus={!initial}
        aria-label="Название места"
        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
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
        aria-label="Адрес"
        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Заметка (необязательно)"
        aria-label="Заметка"
        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
      />
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 min-h-11 rounded-xl bg-secondary py-2.5 text-sm font-medium"
        >
          Отмена
        </button>
        <button
          type="submit"
          className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium flex items-center justify-center gap-1"
        >
          <Plus className="size-4" /> {initial ? "Сохранить" : "Добавить"}
        </button>
      </div>
      {initial && (
        <button
          type="button"
          onClick={() => onDelete(initial)}
          className="w-full min-h-11 rounded-xl text-red-500 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="size-4" /> Удалить место
        </button>
      )}
    </form>
  );
}
