"use client";

import { useState } from "react";
import { motion, AnimatePresence, Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, ChevronDown, GripVertical, MapPin, Moon, Pencil, Plus } from "lucide-react";
import { type Day, type Place } from "@/lib/types";
import { cn } from "@/lib/utils";
import { moneyWhole } from "@/lib/budget/format";
import { daySections, type DaySection } from "@/lib/time-of-day";
import { useReorderPlaces } from "@/hooks/use-trip";
import { toast } from "sonner";
import { PlaceRow } from "./PlaceRow";
import { DeleteDayButton } from "./DeleteDayButton";

interface DayCardProps {
  day: Day;
  /** Символ валюты поездки */
  currency?: string;
  /** Сколько человек делит расходы — для «на человека» в плане дня */
  participantsCount?: number;
  /** День = «сегодня» по календарю поездки */
  isCurrent?: boolean;
  /** День уже прошёл */
  isPast?: boolean;
  /** Раскрыт при монтировании (по умолчанию — нет) */
  defaultExpanded?: boolean;
  /** Зритель только смотрит: кнопок правки нет */
  canEdit?: boolean;
  /** Где ночуем в этот день; "missing" — жильё на эту ночь не указано */
  night?: { name: string } | "missing";
  onOpenPlace: (p: Place) => void;
  onAddPlace?: (dayId: string) => void;
  onEditDay?: (day: Day) => void;
  /** Перейти к жилью */
  onOpenLodging?: () => void;
}

// Форматтеры на уровне модуля: Intl сам по себе дорог в создании.
// Пояс UTC: дата дня хранится как полночь UTC, и в поясе устройства в Америке она уезжала на сутки назад
const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdayFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });

function dateLabel(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${dateFmt.format(d)}, ${weekdayFmt.format(d)}`;
}

export function DayCard({
  day,
  currency,
  participantsCount = 0,
  isCurrent,
  isPast,
  defaultExpanded = false,
  canEdit = true,
  night,
  onOpenPlace,
  onAddPlace,
  onEditDay,
  onOpenLodging,
}: DayCardProps) {
  // Свёрнутые по умолчанию не смонтированы в DOM: вход на вкладку с длинным
  // маршрутом раньше фризил поток на сотни мс — motion-дерево росло на каждый
  // день сразу (аудит 2026-10-02). Раскрытие анимируется как раньше.
  const [expanded, setExpanded] = useState(defaultExpanded);
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
  const date = dateLabel(day.date);
  const allDone = day.places.length > 0 && visited === day.places.length;
  // Автозаголовок «День N» повторил бы первую строку: тогда главным идёт город
  const title = day.title && day.title !== `День ${day.dayNumber}` ? day.title : day.city;

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

  const placeList = (s: DaySection) => {
    const hideTime = !!s.label; // Слот уже назван в заголовке секции
    return canEdit && s.places.length > 1 ? (
      <SortablePlaces
        places={s.places}
        onReorder={(next) => applyReorder(s.key, next)}
        accentColor={accent}
        currency={currency}
        hideTime={hideTime}
        onOpenPlace={onOpenPlace}
      />
    ) : (
      <div className="space-y-1.5">
        {s.places.map((p) => (
          <PlaceRow key={p.id} place={p} accentColor={accent} currency={currency} hideTime={hideTime} canEdit={canEdit} onOpen={() => onOpenPlace(p)} />
        ))}
      </div>
    );
  };

  const contentId = `day-card-content-${day.id}`;

  return (
    <div className="relative pl-8">
      {/* Станция на нити маршрута: прошедший день залит, сегодняшний пульсирует, будущий контурный */}
      <span
        className={cn(
          "absolute left-0 top-4 z-10 size-6 rounded-full grid place-items-center text-[10px] font-bold border-2 border-background",
          isCurrent ? "text-white" : isPast ? "text-white/90" : "bg-card text-muted-foreground border-border"
        )}
        style={(isPast || isCurrent) ? { background: accent } : undefined}
        aria-hidden="true"
      >
        {isPast && allDone ? <Check className="size-3" /> : day.dayNumber}
      </span>
      {isCurrent && !reduceMotion && (
        <motion.span
          aria-hidden="true"
          className="absolute -left-1 top-3 z-0 size-8 rounded-full border-2"
          style={{ borderColor: accent }}
          animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      <div className={cn("rounded-2xl bg-card border overflow-hidden card-hover", isCurrent ? "border-primary/40" : "border-border")}>
        {/* Шапка-«талон»: только то, что отвечает на вопрос «что за день». Правка живёт внутри
            раскрытого дня: карандаш и корзина на каждой из 13 карточек забивали список */}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-start gap-2 p-3.5 hover:bg-accent/40 transition-colors text-left active:bg-accent/60"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isCurrent && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">Сегодня</span>
              )}
              <span className="font-medium text-foreground/85 shrink-0">День {day.dayNumber}</span>
              {date && <span className="tabular-nums truncate">{date}</span>}
            </span>
            <span className="block font-semibold text-[15px] leading-snug mt-0.5 line-clamp-2 text-pretty">{title}</span>
            <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground min-w-0">
              {title !== day.city && (
                <>
                  <MapPin className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{day.city}</span>
                </>
              )}
              {plannedTotal > 0 && (
                <span
                  className="shrink-0 tabular-nums"
                  title={`План дня по бюджетам мест, ≈ ${moneyWhole(sym, plannedPerPerson)} на человека`}
                >
                  {title !== day.city && <span className="opacity-50 mr-1" aria-hidden="true">·</span>}
                  ≈{moneyWhole(sym, plannedTotal)}
                  {plannedPerPerson > 0 && <span className="opacity-80"> · {moneyWhole(sym, plannedPerPerson)}/чел</span>}
                </span>
              )}
            </span>
            {night && night !== "missing" && (
              <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                <Moon className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{night.name}</span>
              </span>
            )}
            {night === "missing" && (
              <span className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-3 shrink-0" aria-hidden="true" /> Жильё на эту ночь не указано
              </span>
            )}
          </span>
          <span className="shrink-0 flex items-center gap-1 pt-0.5">
            <span className={cn("text-xs font-medium tabular-nums", allDone ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
              {visited}/{day.places.length}
            </span>
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
            </motion.span>
          </span>
        </button>

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
              {/* Перфорация «билета» — день как талон маршрута */}
              <div className="relative border-t border-dashed border-border" aria-hidden="true">
                <span className="absolute -left-1.5 -top-[5px] size-3 rounded-full bg-background" />
                <span className="absolute -right-1.5 -top-[5px] size-3 rounded-full bg-background" />
              </div>

              <div className="px-3 pb-3 pt-2 space-y-1.5">
                {day.places.length === 0 && (
                  <p className="text-xs text-muted-foreground py-1">В этот день ещё нет мест</p>
                )}
                {sections.map((s) =>
                  s.label ? (
                    <div key={s.key}>
                      <div className="text-xs font-medium text-muted-foreground mt-2 mb-1 flex items-center gap-2">
                        {s.label}
                        <span className="h-px flex-1 bg-border" aria-hidden="true" />
                      </div>
                      {placeList(s)}
                    </div>
                  ) : (
                    <div key={s.key}>{placeList(s)}</div>
                  )
                )}

                {night === "missing" && canEdit && onOpenLodging && (
                  <button
                    type="button"
                    onClick={onOpenLodging}
                    className="w-full min-h-11 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-800 dark:text-amber-300"
                  >
                    Указать, где ночуем
                  </button>
                )}

                {onAddPlace && (
                  <button
                    type="button"
                    onClick={() => onAddPlace(day.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-3 mt-1.5 rounded-xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors active:scale-[0.98] min-h-11"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    <span className="text-xs font-medium">Добавить место</span>
                  </button>
                )}

                {canEdit && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {onEditDay ? (
                      <button
                        type="button"
                        onClick={() => onEditDay(day)}
                        className="min-h-11 px-2 -ml-2 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" /> Изменить день
                      </button>
                    ) : (
                      <span />
                    )}
                    <DeleteDayButton dayId={day.id} dayNumber={day.dayNumber} />
                  </div>
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
  hideTime,
  onOpenPlace,
}: {
  places: Place[];
  onReorder: (next: Place[]) => void;
  accentColor: string;
  currency?: string;
  hideTime: boolean;
  onOpenPlace: (p: Place) => void;
}) {
  return (
    <Reorder.Group axis="y" values={places} onReorder={onReorder} className="space-y-1.5">
      {places.map((p) => (
        <SortableRow key={p.id} place={p} accentColor={accentColor} currency={currency} hideTime={hideTime} onOpenPlace={onOpenPlace} />
      ))}
    </Reorder.Group>
  );
}

function SortableRow({
  place,
  accentColor,
  currency,
  hideTime,
  onOpenPlace,
}: {
  place: Place;
  accentColor: string;
  currency?: string;
  hideTime: boolean;
  onOpenPlace: (p: Place) => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={place}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-0.5"
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label={`Перетащить «${place.name}», чтобы изменить порядок`}
        className="shrink-0 w-7 h-11 -ml-1.5 grid place-items-center rounded-lg text-muted-foreground/80 hover:text-muted-foreground hover:bg-accent/60 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <div className="flex-1 min-w-0">
        <PlaceRow place={place} accentColor={accentColor} currency={currency} hideTime={hideTime} onOpen={() => onOpenPlace(place)} />
      </div>
    </Reorder.Item>
  );
}
