"use client";

// Вкладка «Жильё»: где ночуем сегодня, лента проживаний по датам, предупреждения о
// ночах без жилья и о двойной брони. Жильё — отдельная сущность (не пункты маршрута):
// маршрут говорит «что делаем», эта вкладка — «где спим» (см. модель Lodging).

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BedDouble, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLodgings, useTrip, type Lodging } from "@/hooks/use-trip";
import { currencySymbol as symbolOf } from "@/lib/currencies";
import { cn, fmtMoney, plural } from "@/lib/utils";
import {
  addDaysKey,
  findLodgingGaps,
  findOverlaps,
  formatDayMonth,
  localTodayKey,
  lodgingPhase,
  nightsOf,
  sortLodgings,
  toDateKey,
} from "@/lib/lodging";
import { LodgingCard } from "./LodgingCard";
import { LodgingHero } from "./LodgingHero";
import { LodgingSheet, type LodgingSheetProps } from "./LodgingSheet";
import { TaxiShowCard } from "./TaxiShowCard";

type SheetState = Pick<LodgingSheetProps, "lodging" | "defaults"> | null;

export function LodgingTab() {
  const { data: trip } = useTrip();
  const { data: lodgings, isLoading, isError, refetch } = useLodgings();
  const { data: session } = useAuth();

  const [sheet, setSheet] = useState<SheetState>(null);
  const [taxi, setTaxi] = useState<Lodging | null>(null);
  // Ручное раскрытие карточек; пока не трогали — раскрыто только текущее проживание
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const todayKey = useMemo(() => localTodayKey(), []);
  const sorted = useMemo(() => sortLodgings(lodgings ?? []), [lodgings]);
  const overlaps = useMemo(() => findOverlaps(sorted), [sorted]);

  // Границы поездки в локальных календарных днях (как их видит пользователь)
  const range = useMemo(() => {
    if (!trip) return null;
    const startKey = localTodayKey(new Date(trip.settings.startDate));
    const lastKey = trip.settings.endDate
      ? localTodayKey(new Date(trip.settings.endDate))
      : addDaysKey(startKey, Math.max(trip.settings.totalDays - 1, 0));
    return { startKey, lastKey };
  }, [trip]);
  const gaps = useMemo(() => (range ? findLodgingGaps(sorted, range.startKey, range.lastKey) : []), [sorted, range]);

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

  const isOpen = (l: Lodging) => open[l.id] ?? lodgingPhase(l, todayKey) === "current";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BedDouble className="size-5 text-primary" /> Жильё
        </h1>
        {canEdit && (
          <button
            type="button"
            onClick={() => setSheet({ lodging: null, defaults: newDefaults() })}
            className="ml-auto min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <Plus className="size-4" /> Добавить
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState canEdit={canEdit} onAdd={() => setSheet({ lodging: null, defaults: newDefaults() })} />
      ) : (
        <>
          <LodgingHero lodgings={sorted} todayKey={todayKey} currencySymbol={sym} onTaxi={setTaxi} />

          <div className="grid grid-cols-3 gap-2">
            <Stat value={String(sorted.length)} label={plural(sorted.length, "проживание", "проживания", "проживаний")} />
            <Stat value={String(totalNights)} label={plural(totalNights, "ночь", "ночи", "ночей")} />
            <Stat value={totalPrice > 0 ? `${sym}${fmtMoney(totalPrice)}` : "—"} label="на жильё" />
          </div>

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
              />
            ))}
          </ul>
        </>
      )}

      {sheet && (
        <LodgingSheet lodging={sheet.lodging} defaults={sheet.defaults} currencySymbol={sym} onClose={() => setSheet(null)} />
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
    </div>
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

function EmptyState({ canEdit, onAdd }: { canEdit: boolean; onAdd: () => void }) {
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
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
        Добавьте отель с адресом на местном языке: в дороге одно нажатие покажет его таксисту, а приложение подскажет, где вы ночуете сегодня.
      </p>
      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className={cn("min-h-12 px-6 rounded-xl bg-primary text-primary-foreground font-medium inline-flex items-center gap-1.5 active:scale-95 transition-transform")}
        >
          <Plus className="size-4" /> Добавить первое жильё
        </button>
      )}
    </motion.div>
  );
}

function LodgingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Загрузка жилья">
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
