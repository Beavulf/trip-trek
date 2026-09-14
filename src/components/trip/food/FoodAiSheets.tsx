"use client";

import { useState } from "react";
import { Check, ChefHat, Loader2, MapPin, RotateCw, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { getTripId } from "@/hooks/trip/trip-id";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { AiDisclaimer } from "../ai-disclaimer";
import { useAddFood, useSuggestFoods, type FoodSuggestion } from "@/hooks/trip/use-foods";
import { useAiRestaurants, useCreatePlacesBatch, type RestaurantDraft } from "@/hooks/trip/use-ai-planner";

// Две ИИ-подборки Еды: пакет блюд города (шеф, LLM) и реальные заведения
// OpenStreetMap рядом с городом дня (ИИ только отбирает и описывает).
// Обе — черновики: в поездку попадает только отмеченное.

const FOOD_EMOJI_BY_CATEGORY: Record<string, string> = {
  restaurant: "🍽️",
  cafe: "☕",
  bar: "🍸",
  sight: "📍",
  park: "🌳",
};

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/* ─── Пакет блюд города (шеф ×10) ─── */

export function FoodPackSheet({
  open,
  onClose,
  city,
  existingNames,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  city: string;
  existingNames: string[];
  onAdded: () => void;
}) {
  const chef = useSuggestFoods();
  const addFood = useAddFood();
  const [targetCity, setTargetCity] = useState(city);
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Пересборка стейта при открытии — рендер-синхронизация (паттерн SettingsTab),
  // не effect: смена пропсы/открытия перерисовывает без лишнего коммита
  const [synced, setSynced] = useState<string | null>(null);
  const syncKey = open ? `open:${city}` : null;
  if (synced !== syncKey) {
    setSynced(syncKey);
    if (open) {
      setTargetCity(city);
      setSuggestions([]);
      setPicked(new Set());
    }
  }

  const ask = async () => {
    try {
      const res = await chef.mutateAsync({ tripId: getTripId(), city: targetCity.trim(), count: 10 });
      // Шеф уже знает существующие по серверному дедупу, но у нас свежее — перестрахуемся
      const have = new Set(existingNames.map(norm));
      const fresh = res.suggestions.filter((s) => !have.has(norm(s.name)));
      setSuggestions(fresh);
      setPicked(new Set(fresh.map((s) => s.name)));
      if (fresh.length === 0) toast("Шеф считает, что список уже полный 😊");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Шеф не смог помочь");
    }
  };

  const addPicked = async () => {
    const items = suggestions.filter((s) => picked.has(s.name));
    if (items.length === 0) return;
    try {
      for (let i = 0; i < items.length; i++) {
        const s = items[i];
        await addFood.mutateAsync({
          name: s.name,
          nameCn: s.nameCn ?? undefined,
          description: s.description,
          city: targetCity.trim(),
          price: s.price ?? undefined,
          emoji: s.emoji,
        });
      }
      toast.success(`Добавлено блюд: ${items.length}`);
      onAdded();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось добавить часть блюд");
    }
  };

  return (
    <MobileBottomSheet open={open} onOpenChange={(v) => !v && onClose()} title="Подборка шефа" titleIcon={<ChefHat className="size-4" />}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            value={targetCity}
            onChange={(e) => setTargetCity(e.target.value)}
            placeholder="Город…"
            className="flex-1 min-h-10 rounded-xl border border-input bg-background px-3 text-sm input-mobile"
            aria-label="Город для подборки"
          />
          <button
            type="button"
            onClick={ask}
            disabled={chef.isPending || !targetCity.trim()}
            className="min-h-10 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {chef.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ChefHat className="size-3.5" />}
            {chef.isPending ? "Думает…" : suggestions.length > 0 ? "Ещё вариант" : "Собрать 10 блюд"}
          </button>
        </div>

        {suggestions.length > 0 && (
          <>
            <div className="space-y-1.5">
              {suggestions.map((s) => {
                const on = picked.has(s.name);
                return (
                  <button
                    key={s.name}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.name)) next.delete(s.name);
                        else next.add(s.name);
                        return next;
                      })
                    }
                    className={cn(
                      "w-full text-left rounded-2xl border p-3 flex items-start gap-2.5 transition-colors",
                      on ? "border-primary/50 bg-primary/5" : "border-border opacity-60"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 size-6 rounded-lg border-2 grid place-items-center shrink-0",
                        on ? "bg-primary border-primary text-primary-foreground" : "border-border"
                      )}
                      aria-hidden
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <span>{s.emoji}</span> {s.name}
                      </span>
                      <span className="block text-xs text-muted-foreground leading-snug mt-0.5">{s.description}</span>
                      {s.price && <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">{s.price}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <AiDisclaimer text="Блюда — культурный ориентир от ИИ, не гарантия: точные названия ищите на месте." />
            <button
              type="button"
              onClick={addPicked}
              disabled={addFood.isPending || picked.size === 0}
              className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {addFood.isPending ? <Loader2 className="size-4 animate-spin" /> : <UtensilsCrossed className="size-4" />}
              Добавить · {picked.size} {plural(picked.size, "блюдо", "блюда", "блюд")}
            </button>
          </>
        )}

        {suggestions.length === 0 && !chef.isPending && (
          <AiDisclaimer text="Шеф предложит знаковые блюда города — от уличной еды до ресторанных специалитетов." />
        )}
      </div>
    </MobileBottomSheet>
  );
}

/* ─── Рестораны рядом с городом дня (OpenStreetMap + ИИ-отбор) ─── */

export function FoodRestaurantsSheet({
  open,
  onClose,
  days,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  days: { id: string; dayNumber: number; city: string }[];
  onAdded: () => void;
}) {
  const restaurants = useAiRestaurants();
  const batch = useCreatePlacesBatch();
  const [dayId, setDayId] = useState<string>(days[0]?.id ?? "");
  const [drafts, setDrafts] = useState<RestaurantDraft[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  // Рендер-синхронизация при открытии (паттерн SettingsTab)
  const [synced, setSynced] = useState<string | null>(null);
  const syncKey = open ? `open:${days[0]?.id ?? ""}` : null;
  if (synced !== syncKey) {
    setSynced(syncKey);
    if (open) {
      setDayId(days[0]?.id ?? "");
      setDrafts([]);
      setPicked(new Set());
      setNote(null);
    }
  }

  const find = async () => {
    if (!dayId) {
      toast.error("Сначала добавьте день в маршрут");
      return;
    }
    try {
      const res = await restaurants.mutateAsync({ dayId });
      setDrafts(res.drafts ?? []);
      setPicked(new Set((res.drafts ?? []).map((d) => d.name)));
      setNote(res.note ?? null);
      if ((res.drafts ?? []).length === 0 && res.note) toast(res.note);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось найти заведения");
    }
  };

  const apply = async () => {
    const items = drafts.filter((d) => picked.has(d.name));
    if (items.length === 0) return;
    try {
      const res = await batch.mutateAsync(
        items.map((d) => ({
          dayId,
          name: d.name,
          category: d.category,
          lat: d.lat,
          lng: d.lng,
          description: d.why,
          address: d.address,
        }))
      );
      toast.success(`Заведений в маршрут: ${res.created}`);
      onAdded();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось добавить заведения");
    }
  };

  return (
    <MobileBottomSheet open={open} onOpenChange={(v) => !v && onClose()} title="Рестораны рядом" titleIcon={<MapPin className="size-4" />}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">день маршрута</p>
          <div className="flex flex-wrap gap-1.5">
            {days.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={dayId === d.id}
                onClick={() => setDayId(d.id)}
                className={cn(
                  "px-3 min-h-9 rounded-full text-xs font-medium transition-colors",
                  dayId === d.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                Д{d.dayNumber} · {d.city}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={find}
          disabled={restaurants.isPending || !dayId}
          className="w-full min-h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          {restaurants.isPending ? <Loader2 className="size-4 animate-spin" /> : restaurants.data ? <RotateCw className="size-4" /> : <MapPin className="size-4" />}
          {restaurants.isPending ? "Ищем в OpenStreetMap…" : drafts.length > 0 ? "Другая подборка" : "Найти заведения"}
        </button>

        {drafts.length > 0 && (
          <>
            <div className="space-y-1.5">
              {drafts.map((d) => {
                const on = picked.has(d.name);
                return (
                  <button
                    key={`${d.name}:${d.lat}`}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(d.name)) next.delete(d.name);
                        else next.add(d.name);
                        return next;
                      })
                    }
                    className={cn(
                      "w-full text-left rounded-2xl border p-3 flex items-start gap-2.5 transition-colors",
                      on ? "border-primary/50 bg-primary/5" : "border-border opacity-60"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 size-6 rounded-lg border-2 grid place-items-center shrink-0",
                        on ? "bg-primary border-primary text-primary-foreground" : "border-border"
                      )}
                      aria-hidden
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <span aria-hidden>{FOOD_EMOJI_BY_CATEGORY[d.category] ?? "🍽️"}</span> {d.name}
                      </span>
                      <span className="block text-xs text-muted-foreground leading-snug mt-0.5">{d.why}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                        {[d.cuisine, d.address].filter(Boolean).join(" · ") || `~${Math.round(d.distance)} м от центра`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <AiDisclaimer />
            <button
              type="button"
              onClick={apply}
              disabled={batch.isPending || picked.size === 0}
              className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {batch.isPending ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
              В маршрут · {picked.size} {plural(picked.size, "заведение", "заведения", "заведений")}
            </button>
          </>
        )}

        {note && drafts.length === 0 && <p className="text-xs text-muted-foreground">{note}</p>}
        {drafts.length === 0 && !restaurants.isPending && !note && (
          <AiDisclaimer text="Реальные заведения из OpenStreetMap поблизости от города выбранного дня — ИИ отберёт разнообразную подборку." />
        )}
      </div>
    </MobileBottomSheet>
  );
}
