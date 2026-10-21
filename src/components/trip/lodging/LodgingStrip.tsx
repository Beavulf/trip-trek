"use client";

// Полка жилья над маршрутом: «где ночуем» под рукой, пока смотришь, что делаем.
// Данные — из вкладки «Жильё» (модель Lodging), а не из мест категории hotel: прежняя
// полка собиралась из пунктов маршрута и не знала ни дат, ни выезда. «Сегодняшнее»
// жильё идёт первым; у закончившейся поездки полка свёрнута и не сдвигает маршрут.
// Нет жилья — полки нет совсем: пустую подсказку на каждом заходе не рисуем.

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { BedDouble, ChevronDown, ChevronRight, Navigation } from "lucide-react";
import { useLodgings, type Lodging } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { cn, plural } from "@/lib/utils";
import {
  currentLodging,
  formatStayRange,
  localTodayKey,
  lodgingTouchesDay,
  nightsOf,
  sortLodgings,
} from "@/lib/lodging";
import { routeUrl } from "./stay-actions";
import { TaxiShowCard } from "./TaxiShowCard";

interface LodgingStripProps {
  /** Выбранный в фильтре день маршрута (ключ ГГГГ-ММ-ДД) — показываем жильё этого дня */
  selectedDayKey: string | null;
  /** Поездка закончилась: «ночуем сегодня» не говорим, полку сворачиваем */
  tripOver: boolean;
}

export function LodgingStrip({ selectedDayKey, tripOver }: LodgingStripProps) {
  const { data: lodgings } = useLodgings();
  const { setActiveTab } = useTripStore();
  const [expanded, setExpanded] = useState(!tripOver);
  const [taxi, setTaxi] = useState<Lodging | null>(null);

  const { visible, tonight } = useMemo(() => {
    const all = sortLodgings(lodgings ?? []);
    const now = tripOver ? undefined : currentLodging(all, localTodayKey());
    const shown = selectedDayKey ? all.filter((l) => lodgingTouchesDay(l, selectedDayKey)) : all;
    // Жильё на эту ночь — первым: именно его ищут вечером, а не по порядку дат
    const ordered = now && shown.includes(now) ? [now, ...shown.filter((l) => l !== now)] : shown;
    return { visible: ordered, tonight: now };
  }, [lodgings, selectedDayKey, tripOver]);

  if (visible.length === 0) return null;

  return (
    <section aria-label="Жильё поездки" className="space-y-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex-1 min-h-11 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-widest text-left"
        >
          <BedDouble className="size-3.5" /> Жильё
          <span className="normal-case tracking-normal font-medium tabular-nums">· {visible.length}</span>
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("lodging")}
          className="min-h-11 px-2 text-xs font-medium text-primary inline-flex items-center gap-0.5 hover:underline"
        >
          Все <ChevronRight className="size-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5 snap-x">
          {visible.map((l) => {
            const isTonight = l === tonight;
            const nights = nightsOf(l);
            const route = routeUrl(l);
            return (
              <div
                key={l.id}
                className={cn(
                  "snap-start shrink-0 w-[240px] rounded-2xl border bg-card p-3 flex flex-col gap-2",
                  isTonight ? "border-emerald-500/50" : "border-border"
                )}
              >
                {isTonight && (
                  <div className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    🌙 Сегодня ночуем здесь
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight line-clamp-2">{l.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {[l.city, formatStayRange(l)].filter(Boolean).join(" · ")}
                    {nights > 0 && ` · ${nights} ${plural(nights, "ночь", "ночи", "ночей")}`}
                  </div>
                </div>
                {l.address && (
                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2" title={l.address}>
                    {l.address}
                  </p>
                )}
                {/* mt-auto: кнопки у карточек разной высоты стоят на одной линии внизу */}
                <div className="flex gap-1.5 mt-auto">
                  <button
                    type="button"
                    onClick={() => setTaxi(l)}
                    className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center justify-center gap-1 active:scale-[0.97] transition-transform"
                  >
                    🚕 Таксисту
                  </button>
                  {route && (
                    <a
                      href={route}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-h-11 rounded-xl border border-border text-xs font-medium inline-flex items-center justify-center gap-1 hover:bg-muted active:scale-[0.97] transition-transform"
                    >
                      <Navigation className="size-3.5" /> Маршрут
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {taxi && (
          <TaxiShowCard
            key={taxi.id}
            name={taxi.nameLocal || taxi.name}
            subtitle={taxi.nameLocal ? taxi.name : null}
            address={taxi.address}
            city={taxi.city}
            onClose={() => setTaxi(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
