"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CheckCircle2, Circle, Coffee, Filter, MapPin, RotateCcw, X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { cn } from "@/lib/utils";
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
  useBodyScrollLock(open);
  if (!open || typeof document === "undefined") return null;

  const activeCount = activeFilterCount(filters);

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-y-auto max-h-[88vh] pb-[env(safe-area-inset-bottom)]"
        >
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2">
              <Filter className="size-5 text-primary" />
              Фильтры карты
              {activeCount > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                  {activeCount}
                </span>
              )}
            </h2>
            <button onClick={() => onOpenChange(false)} className="size-11 rounded-full hover:bg-accent grid place-items-center" aria-label="Закрыть">
              <X className="size-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
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
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

function ToggleRow({
  icon,
  label,
  on,
  onToggle,
  disabled,
}: {
  icon: ReactNode;
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
