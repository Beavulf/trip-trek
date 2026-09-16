"use client";

import { useState } from "react";
import { Check, ChefHat, Loader2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { getTripId } from "@/hooks/trip/trip-id";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { AiDisclaimer } from "../ai-disclaimer";
import { useAddFood, useSuggestFoods, type FoodSuggestion } from "@/hooks/trip/use-foods";

// ИИ-подборка Еды: пакет блюд города от шефа (чистый LLM). «Рестораны рядом»
// (OSM + ИИ-отбор) при схлопе дублей переехали в Chill — rest-chill/RestaurantsSheet.

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/* ─── Пакет блюд города (шеф ×10) ─── */

export function FoodPackSheet({
  open,
  onClose,
  city,
  cities,
  existingNames,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  city: string;
  /** Города дней поездки — быстрый выбор без ручного ввода */
  cities: string[];
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
        {/* Города поездки — тап заполняет поле; свой город можно вписать руками */}
        {cities.length > 0 && (
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">город поездки</p>
            <div className="chip-rail no-scrollbar">
              {cities.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={norm(c) === norm(targetCity)}
                  onClick={() => setTargetCity(c)}
                  className={cn(
                    "min-h-9 px-3 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                    norm(c) === norm(targetCity)
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

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
