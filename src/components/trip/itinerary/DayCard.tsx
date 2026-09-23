"use client";

import { useState } from "react";
import { motion, AnimatePresence, Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, GripVertical, MapPin, Pencil, Plus, Wallet } from "lucide-react";
import { type Day, type Place } from "@/lib/types";
import { cn, fmtMoney } from "@/lib/utils";
import { daySections, type DaySection } from "@/lib/time-of-day";
import { useReorderPlaces } from "@/hooks/use-trip";
import { toast } from "sonner";
import { PlaceRow } from "./PlaceRow";
import { DeleteDayButton } from "./DeleteDayButton";

interface DayCardProps {
  day: Day;
  /** Символ валюты поездки */
  currency?: string;
  /** Сколько участников в поездке — для «на человека» в плане дня */
  participantsCount?: number;
  /** День = «сегодня» по календарю поездки */
  isCurrent?: boolean;
  /** День уже прошёл */
  isPast?: boolean;
  onOpenPlace: (p: Place) => void;
  onAddPlace?: (dayId: string) => void;
  onEditDay?: (day: Day) => void;
}

// Форматтеры на уровне модуля: Intl сам по себе дорог в создании
const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const weekdayFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });

function dateLabel(iso: string): { date: string; weekday: string } | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return {
    date: dateFmt.format(d),
    weekday: weekdayFmt.format(d),
  };
}

export function DayCard({
  day,
  currency,
  participantsCount = 0,
  isCurrent,
  isPast,
  onOpenPlace,
  onAddPlace,
  onEditDay,
}: DayCardProps) {
  const [expanded, setExpanded] = useState(true);
  const reduceMotion = useReducedMotion();
  const accent = day.accentColor ?? "#f97316";
  const reorder = useReorderPlaces();

  // Локальные секции мест: пока тянешь карточку, порядок живёт здесь;
  // после мутации (или чужого place:updated) resync с данными маршрута.
  // Синхронизация в рендере (паттерн «track previous» из PlannerWizard),
  // а не в эффекте — иначе каскад ререндеров.
  const [sections, setSections] = useState<DaySection[]>(() => daySections(day.places));
  const [syncedPlaces, setSyncedPlaces] = useState<Place[] | null>(null);
  if (day.places !== syncedPlaces) {
    setSyncedPlaces(day.places);
    setSections(daySections(day.places));
  }

  const visited = day.places.filter((p) => p.status === "visited").length;
  const progress = day.places.length ? (visited / day.places.length) * 100 : 0;
  const dl = dateLabel(day.date);

  // План дня по бюджетам, указанным в местах; рядом — в пересчёте на человека
  const sym = currency ?? "$";
  const plannedTotal = day.places.reduce((s, p) => s + (p.budget && p.budget > 0 ? p.budget : 0), 0);
  const plannedPerPerson = participantsCount > 0 ? plannedTotal / participantsCount : 0;

  // Перестановка внутри секции (утро/день/вечер/без времени): слоты не смешиваем —
  // «утро» не может уехать в «вечер» перетаскиванием, слот меняется в карточке места.
  const applyReorder = (key: string, nextPlaces: Place[]) => {
    const nextSections = sections.map((s) => (s.key === key ? { ...s, places: nextPlaces } : s));
    setSections(nextSections);
    reorder.mutate(
      { dayId: day.id, placeIds: nextSections.flatMap((s) => s.places.map((p) => p.id)) },
      {
        onError: () => {
          setSections(daySections(day.places));
          toast.error("Не удалось изменить порядок мест");
        },
      }
    );
  };

  const placeRow = (p: Place) => (
    <PlaceRow key={p.id} place={p} accentColor={accent} currency={currency} onOpen={() => onOpenPlace(p)} />
  );

  const contentId = `day-card-content-${day.id}`;

  return (
    <div className="relative pl-8">
      {/* Станция на нити маршрута: прошедший день залит, сегодняшний пульсирует, будущий контурный */}
      <span
        className={cn(
          "absolute left-0 top-5 z-10 size-6 rounded-full grid place-items-center text-[10px] font-bold border-2 border-background",
          isCurrent ? "text-white" : isPast ? "text-white/90" : "bg-card text-muted-foreground border-border"
        )}
        style={(isPast || isCurrent) ? { background: accent } : undefined}
        aria-hidden="true"
      >
        {isPast && visited === day.places.length && day.places.length > 0 ? <Check className="size-3" /> : day.dayNumber}
      </span>
      {isCurrent && !reduceMotion && (
        <motion.span
          aria-hidden="true"
          className="absolute -left-1 top-4 z-0 size-8 rounded-full border-2"
          style={{ borderColor: accent }}
          animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      <div className="rounded-2xl bg-card border border-border overflow-hidden card-hover">
        {/* Шапка-«талон» */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
          className="w-full flex items-start gap-3 p-4 hover:bg-accent/40 transition-colors text-left active:bg-accent/60 cursor-pointer"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
              {isCurrent && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wide">
                  Сегодня
                </span>
              )}
              {!isCurrent && isPast && (
                <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[9px] font-medium uppercase tracking-wide">
                  Прошёл
                </span>
              )}
              {dl && (
                <span className="tabular-nums">{dl.date} · {dl.weekday}</span>
              )}
              <span className="flex items-center gap-0.5">
                <MapPin className="size-3" /> {day.city}
              </span>
              {plannedTotal > 0 && (
                <span
                  className="flex items-center gap-1 tabular-nums font-medium"
                  style={{ color: accent }}
                  title={`План дня по бюджетам мест, ≈ ${sym}${fmtMoney(plannedPerPerson)} на человека`}
                >
                  <Wallet className="size-3" /> ≈{sym}{fmtMoney(plannedTotal)}
                  {plannedPerPerson > 0 && (
                    <span className="text-muted-foreground font-normal">· {sym}{fmtMoney(plannedPerPerson)}/чел</span>
                  )}
                </span>
              )}
            </div>
            <div className="font-semibold text-sm truncate mt-0.5">{day.title}</div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: Math.min(1, Math.max(0, progress / 100)) }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="h-full w-full origin-left rounded-full"
                style={{ background: accent }}
              />
            </div>
          </div>
          <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1">
              {onEditDay && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEditDay(day); }}
                  className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Изменить день"
                  aria-label={`Изменить день ${day.dayNumber}`}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
              <DeleteDayButton dayId={day.id} dayNumber={day.dayNumber} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium tabular-nums text-muted-foreground">{visited}/{day.places.length}</span>
              <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="size-4 text-muted-foreground" />
              </motion.div>
            </div>
          </div>
        </div>

        {/* Перфорация «билета» — день как талон маршрута */}
        <div className="relative border-t border-dashed border-border" aria-hidden="true">
          <span className="absolute -left-1.5 -top-[5px] size-3 rounded-full bg-background" />
          <span className="absolute -right-1.5 -top-[5px] size-3 rounded-full bg-background" />
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              id={contentId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-3 space-y-1.5">
                {day.places.length === 0 && (
                  <p className="text-xs text-muted-foreground/70 italic pb-1">В этот день ещё нет мест</p>
                )}
                {sections.map((s) =>
                  s.label ? (
                    <div key={s.key}>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 mt-2 mb-1 flex items-center gap-1.5">
                        <span className="h-px flex-1 bg-border" aria-hidden="true" />
                        {s.label}
                        <span className="h-px w-6 bg-border" aria-hidden="true" />
                      </div>
                      {s.places.length > 1 ? (
                        <SortablePlaces places={s.places} onReorder={(next) => applyReorder(s.key, next)} accentColor={accent} currency={currency} onOpenPlace={onOpenPlace} />
                      ) : (
                        s.places.map(placeRow)
                      )}
                    </div>
                  ) : s.places.length > 1 ? (
                    <SortablePlaces key={s.key} places={s.places} onReorder={(next) => applyReorder(s.key, next)} accentColor={accent} currency={currency} onOpenPlace={onOpenPlace} />
                  ) : (
                    s.places.map(placeRow)
                  )
                )}
                {onAddPlace && (
                  <button
                    onClick={() => onAddPlace(day.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-3 mt-1.5 rounded-xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors active:scale-[0.98] min-h-11"
                  >
                    <Plus className="size-4" />
                    <span className="text-xs font-medium">Добавить место</span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Сортируемый список мест секции: ручка-грип слева от карточки, тянется только
 * за неё (клик по карточке открывает место). Reorder из framer-motion —
 * и мышь, и тач в одном примитиве, без отдельной DnD-библиотеки.
 */
function SortablePlaces({
  places,
  onReorder,
  accentColor,
  currency,
  onOpenPlace,
}: {
  places: Place[];
  onReorder: (next: Place[]) => void;
  accentColor: string;
  currency?: string;
  onOpenPlace: (p: Place) => void;
}) {
  return (
    <Reorder.Group axis="y" values={places} onReorder={onReorder} className="space-y-1.5">
      {places.map((p) => (
        <SortableRow key={p.id} place={p} accentColor={accentColor} currency={currency} onOpenPlace={onOpenPlace} />
      ))}
    </Reorder.Group>
  );
}

function SortableRow({
  place,
  accentColor,
  currency,
  onOpenPlace,
}: {
  place: Place;
  accentColor: string;
  currency?: string;
  onOpenPlace: (p: Place) => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={place}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-1"
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label={`Перетащить «${place.name}», чтобы изменить порядок`}
        className="shrink-0 size-9 -ml-1.5 grid place-items-center rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/60 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="flex-1 min-w-0">
        <PlaceRow place={place} accentColor={accentColor} currency={currency} onOpen={() => onOpenPlace(place)} />
      </div>
    </Reorder.Item>
  );
}
