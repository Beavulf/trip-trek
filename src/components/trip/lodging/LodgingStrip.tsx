"use client";

// Строка жилья над маршрутом: «где ночуем» под рукой, пока смотришь, что делаем.
// Одна строка про эту ночь, а не лента всех проживаний: полка из карточек съедала первый экран,
// и прошедшие отели занимали столько же места, сколько сегодняшний. Всё остальное на вкладке «Жильё».
// Выбран день в фильтре — строка говорит про него. Жилья в поездке нет — строки нет совсем.

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronRight, Moon } from "lucide-react";
import { useLodgings, type Lodging } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { plural } from "@/lib/utils";
import { daysBetween, nextLodging, nightLodging, toDateKey } from "@/lib/lodging";
import { TaxiShowCard } from "./TaxiShowCard";

interface LodgingStripProps {
  /** Выбранный в фильтре день маршрута (ключ ГГГГ-ММ-ДД); null — смотрим поездку целиком */
  selectedDayKey: string | null;
  todayKey: string;
  startKey: string;
  lastKey: string;
  canEdit: boolean;
}

export function LodgingStrip({ selectedDayKey, todayKey, startKey, lastKey, canEdit }: LodgingStripProps) {
  const { data: lodgings } = useLodgings();
  const { setActiveTab } = useTripStore();
  const [taxi, setTaxi] = useState<Lodging | null>(null);

  const list = lodgings ?? [];
  const key = selectedDayKey ?? todayKey;
  const tripOver = todayKey > lastKey;
  if (list.length === 0 || (tripOver && !selectedDayKey)) return null;

  const openTab = () => setActiveTab("lodging");
  const stay = nightLodging(list, key);
  const next = !stay && !selectedDayKey && todayKey < startKey ? nextLodging(list, key) : undefined;
  const focus = stay ?? next;

  if (!focus) {
    // Ночь последнего дня обычно уже дома, а о прошлом предупреждать поздно
    const missing = key < lastKey && key >= todayKey && key >= startKey;
    if (!missing) return null;
    return (
      <section aria-label="Жильё" className="flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-2.5 pl-3">
        <AlertTriangle className="size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-medium">{key === todayKey ? "На эту ночь жилья нет" : "На эту ночь жилья не указано"}</p>
        {canEdit && (
          <button type="button" onClick={openTab} className="min-h-11 shrink-0 rounded-xl border border-amber-500/50 px-3 text-xs font-semibold">
            Добавить
          </button>
        )}
      </section>
    );
  }

  const inDays = next ? daysBetween(todayKey, toDateKey(next.checkIn)) : 0;
  const label = next
    ? `Заселение ${inDays === 1 ? "завтра" : `через ${inDays} ${plural(inDays, "день", "дня", "дней")}`}`
    : key === todayKey
      ? "Сегодня ночуем здесь"
      : "Ночуем здесь";

  return (
    <section aria-label="Жильё" className="flex items-center gap-1 rounded-2xl border border-border bg-card p-1.5">
      <button type="button" onClick={openTab} className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 text-left hover:bg-accent/50 transition-colors">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" aria-hidden="true">
          <Moon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="block truncate text-sm font-medium">{focus.name}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setTaxi(focus)}
        aria-label={`Показать таксисту: ${focus.name}`}
        title="Показать таксисту"
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-lg active:scale-95 transition-transform"
      >
        <span aria-hidden="true">🚕</span>
      </button>

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
                    setTaxi(null);
                    openTab();
                  }
                : undefined
            }
            onClose={() => setTaxi(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
