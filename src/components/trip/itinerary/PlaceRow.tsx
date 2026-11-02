"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Clock,
  MapPin,
  Navigation,
  Star,
} from "lucide-react";
import { useUpdatePlace } from "@/hooks/use-trip";
import { useTripStore, type TripTab } from "@/lib/trip-store";
import { focusOnMap } from "@/lib/map-bus";
import { CATEGORY_META, type Place } from "@/lib/types";
import { timeLabel } from "@/lib/time-of-day";
import { directionsUrl } from "@/lib/place-links";
import { moneyWhole } from "@/lib/budget/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PlaceRowProps {
  place: Place;
  accentColor: string;
  /** Символ валюты поездки для отображения бюджета места */
  currency?: string;
  /** Слот времени уже назван в заголовке секции дня */
  hideTime?: boolean;
  /** Зритель видит статус, но не меняет его */
  canEdit?: boolean;
  onOpen: () => void;
}

export function PlaceRow({ place, accentColor, currency, hideTime = false, canEdit = true, onOpen }: PlaceRowProps) {
  const update = useUpdatePlace();
  const { setActiveTab } = useTripStore();
  const meta = CATEGORY_META[place.category];
  const visited = place.status === "visited";
  const isCurrent = place.status === "current";

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await update.mutateAsync({ id: place.id, status: visited ? "planned" : "visited" });
      toast(visited ? "Отмечено как запланировано" : "Посещено! 🎉", {
        description: place.name,
      });
    } catch {
      toast.error("Не удалось обновить статус");
    }
  };

  const showOnMap = (e: React.MouseEvent) => {
    e.stopPropagation();
    focusOnMap({ lat: place.lat, lng: place.lng, placeId: place.id });
    setActiveTab("map" as TripTab);
  };

  // Без layout-пропа: он удваивал framer projection-узлы на каждую строку и
  // фризил вход на вкладку (аудит 2026-10-02); перетаскивание анимирует сам
  // Reorder.Item, плавное расступание соседей — приемлемая цена.
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-colors group relative overflow-hidden",
        visited ? "bg-green-500/5" : isCurrent ? "bg-orange-500/10" : "hover:bg-accent"
      )}
    >
      {/* Левая цветная полоска категории */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: visited ? "#22c55e" : isCurrent ? "#f97316" : meta?.color ?? accentColor }}
      />
      {canEdit ? (
        <button
          type="button"
          onClick={toggle}
          className="shrink-0 ml-0.5 size-11 grid place-items-center rounded-xl transition-transform active:scale-90"
          aria-label={visited ? "Отметить как запланированное" : "Отметить посещённым"}
        >
          {visited ? (
            <CheckCircle2 className="size-6 text-green-500" />
          ) : (
            <Circle className={cn("size-6 transition-colors", isCurrent ? "text-orange-500" : "text-muted-foreground group-hover:text-primary")} />
          )}
        </button>
      ) : (
        <span className="shrink-0 ml-1 size-8 grid place-items-center" aria-label={visited ? "Посещено" : "Запланировано"}>
          {visited ? <CheckCircle2 className="size-5 text-green-500" /> : <Circle className="size-5 text-muted-foreground" />}
        </span>
      )}
      <div
        className="size-9 rounded-lg grid place-items-center text-lg shrink-0 transition-transform group-hover:scale-110"
        style={{ background: `${meta?.color}22` }}
      >
        {meta?.emoji}
      </div>
      <div className="min-w-0 flex-1">
        {/* Без зачёркивания: в завершённой поездке зачёркнут почти весь маршрут, а его хочется читать.
            Посещённое и так видно по зелёной отметке */}
        <div className="text-sm font-medium leading-tight break-words">{place.name}</div>
        {/* Адрес */}
        {place.address && (
          <div className="flex items-start gap-1 text-[11px] text-muted-foreground mt-0.5">
            <MapPin className="size-3 mt-px shrink-0" aria-hidden="true" />
            <span className="line-clamp-1">{place.address}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
          {isCurrent && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-orange-600 bg-orange-500/15">
              <span className="relative flex size-1.5" aria-hidden="true">
                <span className="absolute inline-flex size-full rounded-full bg-orange-500 opacity-75 animate-ping" />
                <span className="relative inline-flex size-1.5 rounded-full bg-orange-500" />
              </span>
              Сейчас
            </span>
          )}
          {place.timeOfDay && !hideTime && (
            <span className="flex items-center gap-0.5"><Clock className="size-3" aria-hidden="true" /> {timeLabel(place.timeOfDay)}</span>
          )}
          {place.budget ? (
            <span className="tabular-nums">{moneyWhole(currency ?? "$", place.budget)}</span>
          ) : null}
          {place.rating ? <span className="flex items-center gap-0.5 text-amber-500"><Star className="size-2.5 fill-current" /> {place.rating}</span> : null}
        </div>
        {/* Действия иконками, не текстом: на 390px текстовым ссылкам не хватает
            колонки (аудит 2026-10-03) и они переносились в столбик */}
        <div className="flex items-center gap-1 mt-0.5 -ml-2.5 -mb-1.5">
          <a
            href={directionsUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Как добраться"
            aria-label="Как добраться"
            className="size-10 rounded-lg grid place-items-center text-primary hover:bg-accent transition-colors"
          >
            <Navigation className="size-4" />
          </a>
          <button
            type="button"
            onClick={showOnMap}
            title="Показать на карте поездки"
            aria-label="Показать на карте поездки"
            className="size-10 rounded-lg grid place-items-center text-muted-foreground hover:text-primary hover:bg-accent transition-[color,background-color,transform] active:scale-90"
          >
            <MapPin className="size-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
