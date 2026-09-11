"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useDays, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { currencySymbol } from "@/lib/currencies";
import { type Day, type Place } from "@/lib/types";
import { resolveCityCoords, decodeCustomKey } from "@/lib/city-coords";
import { CalendarPlus, Compass, Loader2, Map as MapIcon, PartyPopper, Plane, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { AddPlaceSheet, type AddPlaceData } from "../add-place-sheet";
import { DayCard } from "./DayCard";
import { PlaceDialog } from "./PlaceDialog";
import { DaySheet, AddDayButton } from "./DaySheet";

function dayCoords(day: {
  cityKey: string;
  places: { lat: number; lng: number }[];
}): { lat: number; lng: number } | null {
  const known = resolveCityCoords(day.cityKey);
  if (known) return { lat: known.lat, lng: known.lng };
  const custom = decodeCustomKey(day.cityKey);
  if (custom) return { lat: custom.lat, lng: custom.lng };
  if (day.places?.length > 0 && day.places[0].lat && day.places[0].lng) {
    return { lat: day.places[0].lat, lng: day.places[0].lng };
  }
  return null;
}

export function Itinerary() {
  const tripId = useCurrentTripId();
  const { data: days, isLoading: daysLoading, isError: daysError, refetch: refetchDays } = useDays();
  const { data: trip, isLoading: tripLoading, isError: tripError, refetch: refetchTrip } = useTrip();
  const { selectedDay, setSelectedDay, setActiveTab } = useTripStore();
  const [openPlace, setOpenPlace] = useState<Place | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addData, setAddData] = useState<AddPlaceData | null>(null);
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [editDay, setEditDay] = useState<Day | null>(null);
  // Дата-статус считаем на клиенте (SSR показывает скелетон) и обновляем раз в минуту,
  // чтобы «Старт через N дней» не зависал
  const [now, setNow] = useState(() => Date.now());
  const urlDayApplied = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Deep-link ?day=N: применяем один раз, когда дни загрузились
  useEffect(() => {
    if (urlDayApplied.current || daysLoading || !days) return;
    urlDayApplied.current = true;
    const raw = new URLSearchParams(window.location.search).get("day");
    const n = raw && /^\d+$/.test(raw) ? Number(raw) : null;
    if (n && days.some((d) => d.dayNumber === n)) setSelectedDay(n);
  }, [days, daysLoading, setSelectedDay]);

  /** Выбор дня синхронно с URL (?day=N), без записи в историю */
  const selectDay = (dayNumber: number | null) => {
    setSelectedDay(dayNumber);
    const url = new URL(window.location.href);
    if (dayNumber == null) url.searchParams.delete("day");
    else url.searchParams.set("day", String(dayNumber));
    window.history.replaceState(null, "", url);
  };

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">🗺️</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Создай или присоединись к поездке</p>
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 transition-transform min-h-11"
          >
            На главную →
          </button>
        </div>
      </div>
    );
  }

  if (tripError || daysError) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="text-4xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить маршрут</p>
        <button
          type="button"
          onClick={() => {
            void refetchTrip();
            void refetchDays();
          }}
          className="inline-flex text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-11"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (tripLoading || daysLoading || !trip) {
    return <ItinerarySkeleton />;
  }

  const dayList = days || [];
  const filteredDays = selectedDay ? dayList.filter((d) => d.dayNumber === selectedDay) : dayList;
  const currentDay = dayList.find((d) => d.dayNumber === trip.currentDayNumber);
  const targetDay = dayList.find((d) => d.dayNumber === selectedDay) ?? currentDay ?? dayList[0];
  const curSym = currencySymbol(trip.settings.currency);

  const openAddForDay = (day: (typeof dayList)[number]) => {
    const coords = dayCoords(day);
    if (!coords) {
      toast.error("Нет координат для дня", {
        description: "Укажи город дня или добавь место с карты",
      });
      return;
    }
    setAddData({ lat: coords.lat, lng: coords.lng, dayId: day.id });
    setAddOpen(true);
  };

  const openAdd = () => {
    if (!targetDay) {
      toast.error("Сначала добавьте день");
      return;
    }
    openAddForDay(targetDay);
  };

  if (dayList.length === 0) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl border-2 border-dashed border-border py-14 px-4 text-center">
          <div className="text-5xl mb-3 opacity-60">🧭</div>
          <p className="font-semibold">Маршрут пуст</p>
          <p className="text-xs text-muted-foreground mt-1 mb-1 max-w-xs mx-auto">
            День — это глава поездки: город, цвет и список мест.
            Добавьте первый день — дальше легко.
          </p>
        </div>
        <AddDayButton onClick={() => setDaySheetOpen(true)} />
        <DaySheet open={daySheetOpen} onOpenChange={setDaySheetOpen} />
      </div>
    );
  }

  // Статус поездки по датам — как в Обзоре
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const start = startOf(new Date(trip.settings.startDate));
  const end = trip.settings.endDate ? startOf(new Date(trip.settings.endDate)) + 86_399_000 : null;
  const isBefore = now < start;
  const isAfter = end != null && now > end;
  const daysUntilStart = Math.max(0, Math.ceil((start - now) / 86_400_000));
  const daysLeft = Math.max(0, trip.currentDayNumber <= trip.settings.totalDays ? trip.settings.totalDays - trip.currentDayNumber + 1 : 0);

  let heroTitle: string;
  let heroSubtitle: string;
  let HeroIcon: typeof Plane;
  if (isBefore) {
    HeroIcon = Compass;
    heroTitle = daysUntilStart <= 1 ? "Завтра в путь!" : `Старт через ${daysUntilStart} ${plural(daysUntilStart, "день", "дня", "дней")}`;
    heroSubtitle = `${trip.settings.totalDays} ${plural(trip.settings.totalDays, "день", "дня", "дней")} · ${trip.totalPlaces} ${plural(trip.totalPlaces, "место", "места", "мест")} в маршруте`;
  } else if (isAfter) {
    HeroIcon = PartyPopper;
    heroTitle = "Маршрут пройден";
    heroSubtitle = `${trip.visitedPlaces} из ${trip.totalPlaces} ${plural(trip.totalPlaces, "места", "мест", "мест")} отмечено`;
  } else {
    HeroIcon = Plane;
    heroTitle = `День ${trip.currentDayNumber} из ${trip.settings.totalDays}`;
    heroSubtitle = currentDay
      ? `${currentDay.city}${currentDay.title && currentDay.title !== `День ${currentDay.dayNumber}` ? ` · ${currentDay.title}` : ""}${daysLeft > 0 ? ` · осталось ${plural(daysLeft, "день", "дня", "дней")}` : ""}`
      : "Город не указан";
  }
  const accent = currentDay?.accentColor ?? dayList[0]?.accentColor ?? "#f97316";

  return (
    <div className="space-y-3 animate-fade-up pb-4">
      {/* Компактный hero: где мы на маршруте и что дальше */}
      <section
        className="rounded-3xl p-4 sm:p-5 text-white shadow-lg relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${accent} 0%, #1c1917 100%)` }}
      >
        <div className="absolute -bottom-10 -right-6 size-32 rounded-full opacity-10 blur-2xl bg-white" aria-hidden="true" />
        <div className="relative">
          <div className="flex items-center gap-1.5 text-white/70 text-[11px] font-medium uppercase tracking-wide">
            <HeroIcon className="size-3.5" />
            <span>Маршрут</span>
            <span className="ml-auto normal-case tracking-normal tabular-nums">{trip.visitedPlaces}/{trip.totalPlaces} мест</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold leading-tight mt-1">{heroTitle}</h1>
          <p className="text-white/80 text-xs sm:text-sm mt-0.5">{heroSubtitle}</p>

          <div className="mt-3 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: Math.min(1, Math.max(0, trip.placeProgress / 100)) }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full w-full origin-left rounded-full bg-white"
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setDaySheetOpen(true)}
              className="flex-1 min-h-11 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur px-3 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors active:scale-[0.98]"
            >
              <CalendarPlus className="size-4" /> Добавить день
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("map")}
              className="flex-1 min-h-11 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur px-3 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors active:scale-[0.98]"
            >
              <MapIcon className="size-4" /> На карте
            </button>
          </div>
        </div>
      </section>

      {/* Липкая линейка дней + быстрое добавление места в выбранный день.
          Офсет — реальная высота хедера из --header-h (синхронизирует app-shell) */}
      <div className="sticky top-[calc(var(--header-h,102px))] z-20 -mx-1 px-1 py-1 bg-background/85 backdrop-blur-sm rounded-xl">
        <div className="flex items-center gap-2">
          <div className="chip-rail no-scrollbar flex-1 gap-1.5">
            <button
              type="button"
              onClick={() => selectDay(null)}
              aria-pressed={!selectedDay}
              className={cn(
                "min-h-11 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95",
                !selectedDay ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
              )}
            >
              Все дни
            </button>
            {dayList.map((d) => {
              const visited = d.places.filter((p) => p.status === "visited").length;
              const isToday = d.dayNumber === trip.currentDayNumber;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => selectDay(d.dayNumber)}
                  aria-pressed={selectedDay === d.dayNumber}
                  aria-label={`День ${d.dayNumber} ${visited}/${d.places.length}${isToday ? ", сегодня" : ""}`}
                  className={cn(
                    "flex items-center gap-1.5 min-h-11 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95",
                    selectedDay === d.dayNumber
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border hover:bg-accent"
                  )}
                >
                  {isToday ? (
                    <span className="relative flex size-2" aria-hidden="true">
                      <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                    </span>
                  ) : (
                    <span className="size-2 rounded-full" style={{ background: d.accentColor ?? "#f97316" }} />
                  )}
                  День {d.dayNumber}
                  <span className="opacity-70 tabular-nums">
                    {visited}/{d.places.length}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={openAdd}
            disabled={!targetDay}
            className="shrink-0 size-11 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-md active:scale-95 transition-transform disabled:opacity-50"
            title={targetDay ? "Добавить место" : "Сначала добавьте день"}
            aria-label="Добавить место"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {/* Нить маршрута: дни-станции на общей линии */}
      <div className="relative">
        <div className="absolute left-[11px] top-3 bottom-3 w-0.5 rounded-full bg-border" aria-hidden="true" />
        <div className="space-y-3">
          {filteredDays.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              currency={curSym}
              isCurrent={day.dayNumber === trip.currentDayNumber}
              isPast={day.dayNumber < trip.currentDayNumber}
              onOpenPlace={setOpenPlace}
              onAddPlace={(dayId) => {
                const d = dayList.find((dd) => dd.id === dayId);
                if (d) openAddForDay(d);
              }}
              onEditDay={setEditDay}
            />
          ))}
        </div>
      </div>

      <AddDayButton onClick={() => setDaySheetOpen(true)} />

      <PlaceDialog place={openPlace} currency={curSym} onClose={() => setOpenPlace(null)} />
      <AddPlaceSheet open={addOpen} onOpenChange={setAddOpen} initial={addData} />
      <DaySheet day={editDay} open={daySheetOpen || !!editDay} onOpenChange={(v) => { setDaySheetOpen(v); if (!v) setEditDay(null); }} />
    </div>
  );
}

function ItinerarySkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-36 rounded-3xl bg-muted" />
      <div className="flex gap-1.5 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-11 w-20 rounded-full bg-muted" />
        ))}
        <div className="size-11 rounded-full bg-muted ml-auto" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-1/4" />
              <div className="h-2.5 bg-muted rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" /> Загрузка маршрута…
      </div>
    </div>
  );
}
