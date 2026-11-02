"use client";

// Вкладка «Жильё»: где ночуем сегодня, лента проживаний по датам, предупреждения о
// ночах без жилья и о двойной брони. Жильё — отдельная сущность (не пункты маршрута):
// маршрут говорит «что делаем», эта вкладка — «где спим» (см. модель Lodging).
// Старые поездки вели отели местами маршрута: их можно перенести сюда (HotelImportSheet).

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BedDouble, ChevronRight, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLodgings, useRouteDays, useTrip, type Lodging } from "@/hooks/use-trip";
import { useTodayKey } from "@/hooks/use-today-key";
import { currencySymbol as symbolOf } from "@/lib/currencies";
import { moneyWhole } from "@/lib/budget/format";
import { cn, plural } from "@/lib/utils";
import {
  addDaysKey,
  currentLodging,
  findLodgingGaps,
  findOverlaps,
  formatDayMonth,
  lodgingPhase,
  nextLodging,
  nightsOf,
  sortLodgings,
  toDateKey,
  upcomingGaps,
} from "@/lib/lodging";
import { proposeStays } from "@/lib/lodging-import";
import { tripRangeKeys } from "@/lib/trip-days";
import { HotelImportSheet } from "./HotelImportSheet";
import { LodgingCard } from "./LodgingCard";
import { LodgingHero } from "./LodgingHero";
import { LodgingSheet, type LodgingSheetProps } from "./LodgingSheet";
import { TaxiShowCard } from "./TaxiShowCard";

type SheetState = Pick<LodgingSheetProps, "lodging" | "defaults"> | null;

export function LodgingTab() {
  const { data: trip } = useTrip();
  const { data: lodgings, isLoading, isError, refetch } = useLodgings();
  const { data: days } = useRouteDays();
  const { data: session } = useAuth();

  const [sheet, setSheet] = useState<SheetState>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [taxi, setTaxi] = useState<Lodging | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const todayKey = useTodayKey();
  const sorted = useMemo(() => sortLodgings(lodgings ?? []), [lodgings]);
  const overlaps = useMemo(() => findOverlaps(sorted), [sorted]);

  const range = useMemo(() => (trip ? tripRangeKeys(trip.settings) : null), [trip]);
  const gaps = useMemo(
    () => (range ? upcomingGaps(findLodgingGaps(sorted, range.startKey, range.lastKey), todayKey) : []),
    [sorted, range, todayKey]
  );
  // Отели из маршрута, ещё не перенесённые сюда
  const proposals = useMemo(() => (days && range ? proposeStays(days, sorted, range.lastKey) : []), [days, sorted, range]);

  if (!trip || isLoading) return <LodgingSkeleton />;
  if (isError) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Не удалось загрузить жильё</p>
        <button type="button" onClick={() => refetch()} className="min-h-11 px-5 rounded-xl border border-input text-sm font-medium">
          Повторить
        </button>
      </div>
    );
  }

  const sym = symbolOf(trip.settings.currency);
  const myId = (session?.user as { id?: string } | undefined)?.id;
  const myRole = trip.participants.find((p) => p.id === myId)?.role;
  const canEdit = myRole !== "viewer";

  const lastOut = sorted.length ? toDateKey(sorted[sorted.length - 1].checkOut) : null;
  const newDefaults = () => {
    const from = lastOut && range && lastOut >= range.startKey ? lastOut : range?.startKey ?? todayKey;
    return { checkIn: from, checkOut: addDaysKey(from, 1) };
  };

  const totalNights = sorted.reduce((s, l) => s + nightsOf(l), 0);
  const totalPrice = sorted.reduce((s, l) => s + (l.price ?? 0), 0);
  // Ночь последнего дня обычно уже дома: с этого дня не просим добавить жильё
  const nightsOver = !!range && todayKey >= range.lastKey;
  const tripOver = !!range && todayKey > range.lastKey;
  const beforeTrip = !!range && todayKey < range.startKey;
  // Карточка, чьи действия уже стоят в герое: второй раз те же кнопки не показываем
  const focusId = (currentLodging(sorted, todayKey) ?? nextLodging(sorted, todayKey))?.id;
  const isOpen = (l: Lodging) => open[l.id] ?? false;
  const mapCenter = days?.flatMap((d) => d.places)[0];

  return (
    // Одна колонка ограничена по ширине: на десктопе растянутые на 1200px герой и
    // кнопки теряют форму, а лента читается лучше в узкой колонке
    <div className="space-y-4 mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BedDouble className="size-5 text-primary" aria-hidden="true" /> Жильё
        </h1>
        {canEdit && (
          <button
            type="button"
            onClick={() => setSheet({ lodging: null, defaults: newDefaults() })}
            className="ml-auto min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <Plus className="size-4" aria-hidden="true" /> Добавить
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          canEdit={canEdit}
          tripOver={tripOver}
          onAdd={() => setSheet({ lodging: null, defaults: newDefaults() })}
          importCount={proposals.length}
          onImport={() => setImportOpen(true)}
        />
      ) : (
        <>
          <LodgingHero
            lodgings={sorted}
            todayKey={todayKey}
            currencySymbol={sym}
            nightsOver={nightsOver}
            beforeTrip={beforeTrip}
            tripTitle={trip.settings.title}
            onAddToday={canEdit ? () => setSheet({ lodging: null, defaults: { checkIn: todayKey, checkOut: addDaysKey(todayKey, 1) } }) : undefined}
            onTaxi={setTaxi}
          />

          <div className="grid grid-cols-3 gap-2">
            <Stat value={String(sorted.length)} label={plural(sorted.length, "проживание", "проживания", "проживаний")} />
            <Stat value={String(totalNights)} label={plural(totalNights, "ночь", "ночи", "ночей")} />
            <Stat value={totalPrice > 0 ? moneyWhole(sym, totalPrice) : "—"} label="на жильё" />
          </div>

          {canEdit && proposals.length > 0 && <ImportBanner count={proposals.length} onOpen={() => setImportOpen(true)} />}

          {gaps.map((g) => (
            <div key={g.fromKey} className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-center gap-3">
              <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  Нет жилья на {g.nights} {plural(g.nights, "ночь", "ночи", "ночей")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDayMonth(g.fromKey)}
                  {g.nights > 1 ? ` – ${formatDayMonth(addDaysKey(g.toKey, -1))}` : ""}
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setSheet({ lodging: null, defaults: { checkIn: g.fromKey, checkOut: g.toKey } })}
                  className="min-h-11 px-3 rounded-xl border border-amber-500/50 text-xs font-semibold"
                >
                  Добавить
                </button>
              )}
            </div>
          ))}

          <ul className="relative space-y-3" aria-label="Проживания по датам">
            <div className="absolute left-[10px] top-4 bottom-4 w-0.5 rounded-full bg-border" aria-hidden />
            {sorted.map((l, i) => (
              <LodgingCard
                key={l.id}
                lodging={l}
                todayKey={todayKey}
                index={i}
                expanded={isOpen(l)}
                onToggle={() => setOpen((s) => ({ ...s, [l.id]: !isOpen(l) }))}
                canEdit={canEdit}
                onEdit={() => setSheet({ lodging: l })}
                onTaxi={() => setTaxi(l)}
                currencySymbol={sym}
                overlapping={overlaps.has(l.id)}
                hideActions={l.id === focusId}
                pastTone={lodgingPhase(l, todayKey) === "past"}
                tripTitle={trip.settings.title}
              />
            ))}
          </ul>
        </>
      )}

      {sheet && (
        <LodgingSheet
          lodging={sheet.lodging}
          defaults={sheet.defaults}
          currencySymbol={sym}
          mapCenter={mapCenter ? { lat: mapCenter.lat, lng: mapCenter.lng } : undefined}
          onClose={() => setSheet(null)}
        />
      )}
      {importOpen && <HotelImportSheet proposals={proposals} currencySymbol={sym} onClose={() => setImportOpen(false)} />}
      <AnimatePresence>
        {taxi && (
          <TaxiShowCard
            key={taxi.id}
            name={taxi.nameLocal || taxi.name}
            subtitle={taxi.nameLocal ? taxi.name : null}
            address={taxi.address}
            city={taxi.city}
            onAddAddress={
              canEdit
                ? () => {
                    const l = taxi;
                    setTaxi(null);
                    setSheet({ lodging: l });
                  }
                : undefined
            }
            onClose={() => setTaxi(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ImportBanner({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3 text-left hover:bg-primary/10 transition-colors"
    >
      <span className="text-xl" aria-hidden="true">🏨</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">В маршруте есть отели</span>
        <span className="block text-xs text-muted-foreground">
          Можно перенести сюда: {count} {plural(count, "проживание", "проживания", "проживаний")}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2.5 text-center">
      <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyState({
  canEdit,
  tripOver,
  onAdd,
  importCount,
  onImport,
}: {
  canEdit: boolean;
  tripOver: boolean;
  onAdd: () => void;
  importCount: number;
  onImport: () => void;
}) {
  const canImport = canEdit && importCount > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center space-y-3"
    >
      <div className="text-5xl" aria-hidden>
        🏨
      </div>
      <h2 className="text-lg font-semibold">Пока нет жилья</h2>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto text-pretty">
        {canImport
          ? `В маршруте нашлись отели: ${importCount} ${plural(importCount, "проживание", "проживания", "проживаний")}. Перенесите их сюда, проверив названия и даты.`
          : tripOver
            ? "Жильё этой поездки не заполнено."
            : "Добавьте отель с адресом на местном языке: в дороге одно нажатие покажет его таксисту, а приложение подскажет, где вы ночуете сегодня."}
      </p>
      {canImport && (
        <button
          type="button"
          onClick={onImport}
          className="min-h-12 px-6 rounded-xl bg-primary text-primary-foreground font-medium inline-flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          Перенести отели из маршрута
        </button>
      )}
      {canEdit && (
        <div>
          <button
            type="button"
            onClick={onAdd}
            className={cn(
              "inline-flex items-center gap-1.5 active:scale-95 transition-transform rounded-xl font-medium",
              canImport ? "min-h-11 px-4 text-sm text-muted-foreground hover:text-foreground" : "min-h-12 px-6 bg-primary text-primary-foreground"
            )}
          >
            <Plus className="size-4" aria-hidden="true" /> Добавить первое жильё
          </button>
        </div>
      )}
    </motion.div>
  );
}

function LodgingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse mx-auto w-full max-w-2xl" aria-busy="true" aria-label="Загрузка жилья">
      <div className="h-8 w-32 rounded-lg bg-muted" />
      <div className="h-56 rounded-3xl bg-muted" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-28 rounded-2xl bg-muted" />
    </div>
  );
}
