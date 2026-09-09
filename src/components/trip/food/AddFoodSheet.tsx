"use client";

import { useEffect, useState } from "react";
import { Check, ChefHat, Loader2, Plus, Sparkles, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import {
  getTripId,
  useAddFood,
  useSuggestFoods,
  type FoodSuggestion,
} from "@/hooks/use-trip";
import { FOOD_EMOJIS } from "./shared";

interface AddFoodSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Города из маршрута — чипсы быстрого выбора */
  dayCities: string[];
  /** Символ валюты поездки для плейсхолдера цены */
  priceSym: string;
  /** Предзаполнить город (например, активный фильтр по городу) */
  defaultCity?: string;
}

/** Шторка «Новое блюдо»: компактная форма + советы шефа (LLM) по городу */
export function AddFoodSheet({ open, onOpenChange, dayCities, priceSym, defaultCity }: AddFoodSheetProps) {
  const addFood = useAddFood();
  const chef = useSuggestFoods();
  const [name, setName] = useState("");
  const [nameCn, setNameCn] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [place, setPlace] = useState("");
  const [price, setPrice] = useState("");
  const [emoji, setEmoji] = useState("🍽️");
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [addedIdx, setAddedIdx] = useState<Set<number>>(new Set());

  // При открытии — чистая форма; город подсказываем (фильтр или первый город маршрута)
  useEffect(() => {
    if (!open) return;
    setName("");
    setNameCn("");
    setDescription("");
    setCity(defaultCity ?? "");
    setPlace("");
    setPrice("");
    setEmoji("🍽️");
    setSuggestions([]);
    setAddedIdx(new Set());
  }, [open, defaultCity]);

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
      toast.success("Блюдо добавлено! 🍽️", { description: name.trim() });
      onOpenChange(false);
    } catch (err) {
      // Форму не чистим — пусть пользователь видит, что ввёл
      toast.error("Не удалось добавить блюдо", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  const askChef = async () => {
    if (!city.trim()) {
      toast.error("Сначала укажи город", {
        description: "Шеф советует блюда под конкретное место",
      });
      return;
    }
    try {
      const res = await chef.mutateAsync({ tripId: getTripId(), city: city.trim() });
      setSuggestions(res.suggestions);
      setAddedIdx(new Set());
      if (res.suggestions.length === 0) toast("Шеф не нашёл, что добавить — список уже полный");
    } catch (err) {
      toast.error("Шеф не смог помочь", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  const addSuggestion = async (s: FoodSuggestion, idx: number) => {
    try {
      await addFood.mutateAsync({
        name: s.name,
        nameCn: s.nameCn ?? undefined,
        description: s.description || undefined,
        city: city.trim(),
        price: s.price ?? undefined,
        emoji: s.emoji,
      });
      setAddedIdx((prev) => new Set(prev).add(idx));
      toast.success(`Добавлено: ${s.name}`);
    } catch (err) {
      toast.error("Не удалось добавить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  const addAllSuggestions = async () => {
    for (let i = 0; i < suggestions.length; i++) {
      if (addedIdx.has(i)) continue;
      await addSuggestion(suggestions[i], i);
    }
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Новое блюдо"
      titleIcon={<UtensilsCrossed className="size-5 text-primary" />}
    >
      <div className="space-y-3">
        {/* Иконка — одна строка со скроллом */}
        <div>
          <label className="mb-1.5 block text-xs text-muted-foreground">Иконка</label>
          <div className="chip-rail no-scrollbar">
            {FOOD_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-label={`Иконка ${e}`}
                aria-pressed={emoji === e}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-lg text-xl transition-all",
                  emoji === e ? "bg-primary/20 ring-2 ring-primary" : "bg-muted"
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Название *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Пельмени"
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Город *</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Город"
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
          />
          {dayCities.length > 0 && (
            <div className="chip-rail no-scrollbar mt-2">
              {dayCities.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCity(c)}
                  aria-label={`Город ${c}`}
                  className={cn(
                    "min-h-9 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    city === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Советы шефа */}
        <div className="rounded-2xl border border-dashed border-orange-500/40 bg-orange-500/5 p-3">
          <div className="flex items-center gap-2">
            <ChefHat className="size-5 shrink-0 text-orange-500" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold">Спросить шефа</div>
              <div className="text-[11px] text-muted-foreground">
                {city.trim() ? `Знаковые блюда города ${city.trim()}` : "Укажи город — шеф предложит блюда"}
              </div>
            </div>
            <button
              type="button"
              onClick={askChef}
              disabled={chef.isPending}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-orange-500 px-3.5 py-2.5 text-xs font-semibold text-white transition-transform active:scale-95 min-h-11 disabled:opacity-60"
            >
              {chef.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {chef.isPending ? "Думает…" : "Совет"}
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              {suggestions.map((s, i) => {
                const added = addedIdx.has(i);
                return (
                  <div
                    key={`${s.name}-${i}`}
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl border bg-card p-2.5 transition-opacity",
                      added ? "border-green-500/40 opacity-70" : "border-border"
                    )}
                  >
                    <span className="mt-0.5 text-xl">{s.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold leading-tight">
                        {s.name}
                        {s.nameCn && <span className="ml-1 font-normal text-muted-foreground">{s.nameCn}</span>}
                      </div>
                      {s.description && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                          {s.description}
                        </p>
                      )}
                      {s.price && <div className="mt-1 text-[11px] font-medium text-muted-foreground">{s.price}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => addSuggestion(s, i)}
                      disabled={added || addFood.isPending}
                      aria-label={added ? `${s.name} уже в списке` : `Добавить ${s.name}`}
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-full transition-all active:scale-90",
                        added ? "bg-green-500/15 text-green-600" : "bg-primary/10 text-primary hover:bg-primary/20"
                      )}
                    >
                      {added ? <Check className="size-4" /> : <Plus className="size-4" />}
                    </button>
                  </div>
                );
              })}
              {addedIdx.size < suggestions.length && (
                <button
                  type="button"
                  onClick={addAllSuggestions}
                  disabled={addFood.isPending}
                  className="w-full rounded-xl border border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary min-h-11 disabled:opacity-50"
                >
                  Добавить все ({suggestions.length - addedIdx.size})
                </button>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Оригинальное название</label>
          <input
            value={nameCn}
            onChange={(e) => setNameCn(e.target.value)}
            placeholder="На местном языке"
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Где попробовать</label>
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Ресторан, рынок"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Цена</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={`напр. ${priceSym}25–40`}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Что это, вкус, стоит ли пробовать…"
            rows={2}
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={addFood.isPending}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {addFood.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {addFood.isPending ? "Добавление…" : "Добавить блюдо"}
        </button>
      </div>
    </MobileBottomSheet>
  );
}
