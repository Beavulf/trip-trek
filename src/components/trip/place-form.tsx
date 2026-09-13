"use client";

// PlaceForm — единственная форма полей места для создания и редактирования.
// Хосты (AddPlaceSheet — создание, PlaceDialog — правка) подставляют раскладку
// и сабмит; dirty-математика — в lib/place-draft.ts (diffPlaceDraft).
// Фаза 5 углубления карты: раньше две state-машины дублировали одни и те же поля.
import { CalendarClock } from "lucide-react";
import { CATEGORY_META, CATEGORY_SHORT } from "@/lib/types";
import { TIME_SLOTS, timeLabel } from "@/lib/time-of-day";
import { cn } from "@/lib/utils";
import type { PlaceDraft } from "@/lib/place-draft";

interface PlaceFormProps {
  value: PlaceDraft;
  onChange: (patch: Partial<PlaceDraft>) => void;
  /** Символ валюты для подписи поля бюджета */
  currency?: string;
  /** Префикс id полей: диалог и шит могут быть на странице одновременно */
  idPrefix?: string;
}

export function PlaceForm({ value, onChange, currency, idPrefix = "place" }: PlaceFormProps) {
  const id = (field: string) => `${idPrefix}-${field}`;
  return (
    <>
      <div>
        <label htmlFor={id("name")} className="text-xs text-muted-foreground mb-1 block">Название</label>
        <input
          id={id("name")}
          name="name"
          type="text"
          autoComplete="off"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm input-mobile"
        />
      </div>

      <div>
        <div id={id("category-label")} className="text-xs text-muted-foreground mb-1.5">Категория</div>
        <div role="group" aria-labelledby={id("category-label")} className="grid grid-cols-3 gap-1.5">
          {Object.entries(CATEGORY_META).map(([k, v]) => (
            <button
              key={k}
              type="button"
              title={v.label}
              onClick={() => onChange({ category: k })}
              aria-pressed={value.category === k}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg py-1.5 min-h-11 text-[10px] font-medium transition-colors border",
                value.category === k
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary/50 hover:bg-accent"
              )}
            >
              <span className="text-base leading-none" aria-hidden="true">{v.emoji}</span>
              {CATEGORY_SHORT[k] ?? v.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div id={id("time-label")} className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
          <CalendarClock className="size-3" /> Время суток
        </div>
        <div role="group" aria-labelledby={id("time-label")} className="grid grid-cols-3 gap-1.5">
          {TIME_SLOTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onChange({ timeOfDay: value.timeOfDay === s.key ? "" : s.key })}
              aria-pressed={value.timeOfDay === s.key}
              className={cn(
                "rounded-lg py-2 min-h-11 text-xs font-medium transition-colors border",
                value.timeOfDay === s.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary/50 hover:bg-accent"
              )}
            >
              {timeLabel(s.key, { emoji: true })}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={id("budget")} className="text-xs text-muted-foreground mb-1 block">
            Бюджет{currency ? `, ${currency}` : ""}
          </label>
          <input
            id={id("budget")}
            name="budget"
            type="number"
            inputMode="decimal"
            autoComplete="off"
            value={value.budget}
            onChange={(e) => onChange({ budget: e.target.value })}
            placeholder="0"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm input-mobile"
          />
        </div>
        <div>
          <label htmlFor={id("address")} className="text-xs text-muted-foreground mb-1 block">Адрес</label>
          <input
            id={id("address")}
            name="address"
            type="text"
            autoComplete="off"
            value={value.address}
            onChange={(e) => onChange({ address: e.target.value })}
            placeholder="Адрес…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm input-mobile"
          />
        </div>
      </div>

      <div>
        <label htmlFor={id("description")} className="text-xs text-muted-foreground mb-1 block">Описание</label>
        <textarea
          id={id("description")}
          name="description"
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Чем интересно место…"
          rows={2}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm input-mobile resize-none"
        />
      </div>
    </>
  );
}
