"use client";

import { Camera, Circle, Coffee, Filter, MapPin, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { activeFilterCount, DEFAULT_MAP_FILTERS, type MapFilters } from "@/lib/map-filters";

export type { MapFilters };

interface FiltersSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cities: { cityKey: string; city: string; accentColor: string; count: number }[];
  filters: MapFilters;
  onChange: (patch: Partial<MapFilters>) => void;
  photoCount: number;
  placeCount: number;
  visitedCount: number;
  /** Подсказка про карты в Китае и т.п. */
  note?: string | null;
}

export function FiltersSheet({
  open,
  onOpenChange,
  cities,
  filters,
  onChange,
  photoCount,
  placeCount,
  visitedCount,
  note,
}: FiltersSheetProps) {
  if (!open) return null;

  const activeCount = activeFilterCount(filters);

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      titleIcon={<Filter className="size-5 text-primary" />}
      title={
        <>
          Фильтры карты
          {activeCount > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
              {activeCount}
            </span>
          )}
        </>
      }
      contentClassName="space-y-4"
    >
      {/* Города */}
      <div>
        <div className="text-xs text-muted-foreground mb-1.5">Города маршрута</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onChange({ cityFilter: null })}
            aria-pressed={filters.cityFilter === null}
            className={cn(
              "min-h-11 px-3 rounded-full text-sm font-medium transition-colors",
              filters.cityFilter === null ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"
            )}
          >
            Все
          </button>
          {cities.map((c) => (
            <button
              key={c.cityKey}
              type="button"
              onClick={() => onChange({ cityFilter: c.cityKey })}
              aria-pressed={filters.cityFilter === c.cityKey}
              className={cn(
                "flex items-center gap-1.5 min-h-11 px-3 rounded-full text-sm font-medium transition-colors",
                filters.cityFilter === c.cityKey ? "text-white" : "bg-secondary hover:bg-accent"
              )}
              style={filters.cityFilter === c.cityKey ? { background: c.accentColor } : undefined}
            >
              <span className="size-2 rounded-full" style={{ background: c.accentColor }} />
              {c.city}
              <span className={cn("text-[10px] font-bold", filters.cityFilter === c.cityKey ? "text-white/70" : "text-muted-foreground")}>
                {c.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Переключатели */}
      <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
        <ToggleRow
          icon={<Circle className="size-4" />}
          label="Только непосещённые"
          on={filters.onlyUnvisited}
          onToggle={() => onChange({ onlyUnvisited: !filters.onlyUnvisited })}
        />
        <ToggleRow
          icon={<Coffee className="size-4" />}
          label="Кафе, бары и еда"
          on={filters.onlyChill}
          onToggle={() => onChange({ onlyChill: !filters.onlyChill })}
        />
        <ToggleRow
          icon={<Camera className="size-4" />}
          label={photoCount > 0 ? `Фото на карте (${photoCount})` : "Фото на карте"}
          on={filters.showPhotos}
          disabled={photoCount === 0}
          onToggle={() => onChange({ showPhotos: !filters.showPhotos })}
        />
        {photoCount > 0 && (
          <ToggleRow
            icon={<MapPin className="size-4" />}
            label="Скрыть места, оставить фото"
            on={filters.onlyPhotos}
            onToggle={() => onChange({ onlyPhotos: !filters.onlyPhotos })}
          />
        )}
      </div>

      {/* Легенда + итоги */}
      <div className="rounded-2xl bg-muted/50 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-full bg-slate-400" /> Запланировано
          <span className="size-2.5 rounded-full bg-orange-500 ml-2" /> Сейчас здесь
          <span className="size-2.5 rounded-full bg-green-500 ml-2" /> Посещено
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-full border-[3px] border-white bg-cyan-500" /> Фотография
          {placeCount > 0 && (
            <span className="ml-auto">
              {visitedCount} из {placeCount} посещено
            </span>
          )}
        </div>
      </div>

      {/* Сброс */}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_MAP_FILTERS)}
          className="w-full min-h-11 rounded-xl border border-border text-sm font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors"
        >
          <RotateCcw className="size-4" />
          Сбросить фильтры
        </button>
      )}

      {note && (
        <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
          💡 {note}
        </p>
      )}
    </MobileBottomSheet>
  );
}

function ToggleRow({
  icon,
  label,
  on,
  onToggle,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        "w-full flex items-center gap-3 px-3 min-h-[3.25rem] text-left text-sm font-medium transition-colors",
        disabled ? "opacity-40" : "hover:bg-accent/50"
      )}
    >
      <span className={cn("shrink-0", on ? "text-primary" : "text-muted-foreground")}>{icon}</span>
      <span className="flex-1 min-w-0">{label}</span>
      {/* Переключатель */}
      <span
        className={cn(
          "relative w-10 h-6 rounded-full transition-colors shrink-0",
          on ? "bg-primary" : "bg-muted-foreground/25"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
            on ? "left-[1.125rem]" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}
