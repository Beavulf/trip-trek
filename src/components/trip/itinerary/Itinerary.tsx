"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLodgings, useRouteDays, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { currencySymbol } from "@/lib/currencies";
import { tripDateKey, tripRangeKeys } from "@/lib/trip-days";
import { type Day, type Place } from "@/lib/types";
import { resolveCityCoords, decodeCustomKey } from "@/lib/city-coords";
import { expenseSelectableParticipants } from "@/lib/budget";
import { ChevronDown, FileDown, Loader2, Map as MapIcon, Plus, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTodayKey } from "@/hooks/use-today-key";
import { ShareTripSheet } from "../share-trip-sheet";
import { AddPlaceSheet, type AddPlaceData } from "../add-place-sheet";
import { EmptyHero } from "../empty-hero";
import { DayCard } from "./DayCard";
import { PlaceDialog } from "./PlaceDialog";
import { DaySheet, AddDayButton } from "./DaySheet";
import { PlannerWizard } from "./PlannerWizard";
import { LodgingStrip } from "../lodging";
import { daysBetween, nightLodging } from "@/lib/lodging";

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
  const { data: days, isLoading: daysLoading, isError: daysError, refetch: refetchDays } = useRouteDays();
  const { data: trip, isLoading: tripLoading, isError: tripError, refetch: refetchTrip } = useTrip();
  const { selectedDay, setSelectedDay, setActiveTab } = useTripStore();
  const { data: session } = useAuth();
  const [openPlace, setOpenPlace] = useState<Place | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addData, setAddData] = useState<AddPlaceData | null>(null);
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [editDay, setEditDay] = useState<Day | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const { data: lodgings } = useLodgings();
  // Живой «сегодня»: статус поездки и полка жилья не должны застывать на дне входа
  const todayKey = useTodayKey();
  const urlDayApplied = useRef(false);
  const railRef = useRef<HTMLDivElement>(null);

  const range = trip ? tripRangeKeys(trip.settings) : null;
  const inTrip = !!range && todayKey >= range.startKey && todayKey <= range.lastKey;
  const focusChip = selectedDay ?? (inTrip ? trip?.currentDayNumber : null);

  // Выбранный или сегодняшний день всегда виден на полосе: из 13 чипов он легко оказывался за краем
  useEffect(() => {
    const rail = railRef.current;
    const chip = focusChip != null ? rail?.querySelector<HTMLElement>(`[data-day-chip="${focusChip}"]`) : null;
    if (!rail || !chip) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollTo({ left: chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
  }, [focusChip, days?.length]);

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
      <EmptyHero
        emoji="🗺️"
        title="Нет активной поездки"
        text="Создай или присоединись к поездке"
        actionLabel="На главную →"
        onAction={() => setActiveTab("dashboard")}
      />
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
  const { startKey, lastKey } = range!;
  const isBefore = todayKey < startKey;
  const tripOver = todayKey > lastKey;
  const selectedDayDate = selectedDay ? dayList.find((d) => d.dayNumber === selectedDay)?.date : undefined;
  const selectedDayKey = selectedDayDate ? tripDateKey(selectedDayDate) : null;
  // Зритель только смотрит: кнопки правки вели к отказу сервера (API пускает лишь редакторов)
  const me = session?.user as { id?: string } | undefined;
  const myRole = trip.participants.find((p) => p.id === me?.id)?.role;
  const canEdit = myRole !== "viewer";

  const openAddForDay = (day: (typeof dayList)[number]) => {
    const coords = dayCoords(day);
    if (!coords) {
      toast.error("Нет координат для дня", {
        description: "Укажи город дня или добавь место с карты",
      });
      return;
    }
    // Координаты дня — лишь центр города: точку человек выбирает сам
    setAddData({ lat: coords.lat, lng: coords.lng, dayId: day.id, approximate: true });
    setAddOpen(true);
  };

  const openAdd = () => {
    if (!targetDay) {
      toast.error("Сначала добавьте день");
      return;
    }
    openAddForDay(targetDay);
  };

  const downloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/export/pdf?tripId=${tripId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Не удалось сформировать PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${trip.settings.title.replace(/[<>:"/\\|?*]+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Маршрут скачан 📄");
    } catch (e) {
      toast.error("PDF не скачался", {
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    } finally {
      setPdfLoading(false);
    }
  };

  if (dayList.length === 0) {
    return (
      <div className="space-y-4 animate-fade-up pb-20 mx-auto w-full max-w-3xl">
        <div className="rounded-3xl border-2 border-dashed border-border py-14 px-4 text-center">
          <div className="text-5xl mb-3 opacity-60">🧭</div>
          <p className="font-semibold">Маршрут пуст</p>
          <p className="text-xs text-muted-foreground mt-1 mb-1 max-w-xs mx-auto">
            День — это глава поездки: город, цвет и список мест.
            Добавьте первый день — дальше легко.
          </p>
        </div>
        {canEdit && <AddDayButton onClick={() => setDaySheetOpen(true)} />}
        <DaySheet open={daySheetOpen} onOpenChange={setDaySheetOpen} />
      </div>
    );
  }

  // Статус поездки считается по календарным дням: шапка, полка жилья и «сегодня» в списке согласованы
  const daysUntilStart = daysBetween(todayKey, startKey);
  const daysLeft = Math.max(0, trip.settings.totalDays - trip.currentDayNumber + 1);

  let heroTitle: string;
  let heroSubtitle: string;
  if (isBefore) {
    heroTitle = daysUntilStart <= 1 ? "Завтра в путь!" : `Старт через ${daysUntilStart} ${plural(daysUntilStart, "день", "дня", "дней")}`;
    heroSubtitle = `${trip.settings.totalDays} ${plural(trip.settings.totalDays, "день", "дня", "дней")}, ${trip.totalPlaces} ${plural(trip.totalPlaces, "место", "места", "мест")} в маршруте`;
  } else if (tripOver) {
    heroTitle = "Маршрут пройден";
    heroSubtitle = `Отмечено ${trip.visitedPlaces} из ${trip.totalPlaces} ${plural(trip.totalPlaces, "места", "мест", "мест")}`;
  } else {
    heroTitle = `День ${trip.currentDayNumber} из ${trip.settings.totalDays}`;
    heroSubtitle = currentDay
      ? `${currentDay.city}${currentDay.title && currentDay.title !== `День ${currentDay.dayNumber}` ? ` · ${currentDay.title}` : ""}${daysLeft > 0 ? ` · осталось ${daysLeft} ${plural(daysLeft, "день", "дня", "дней")}` : ""}`
      : "Город не указан";
  }
  const accent = currentDay?.accentColor ?? dayList[0]?.accentColor ?? "#f97316";
  // «Поделиться» — публичной ссылкой делятся все участники кроме зрителей,
  // управляет ею владелец (как в trip-info-sheet: роль из участников, не из токена)
  const isOwner = myRole === "owner";
  const canShare = !!myRole && myRole !== "viewer";
  // Делят расходы только участники: зритель смотрит и в «на человека» не входит
  const payers = expenseSelectableParticipants(trip.participants).length;

  // Идущая поездка: сверху то, что впереди, а не позавчерашний день
  const pastDays = inTrip && !selectedDay ? filteredDays.filter((d) => d.dayNumber < trip.currentDayNumber) : [];
  const shownDays = pastDays.length > 0 && !showPast ? filteredDays.filter((d) => d.dayNumber >= trip.currentDayNumber) : filteredDays;
  const hasLodgings = (lodgings?.length ?? 0) > 0;
  const nightOf = (day: Day) => {
    if (!hasLodgings) return undefined;
    const key = tripDateKey(day.date);
    const stay = nightLodging(lodgings ?? [], key);
    if (stay) return { name: stay.name };
    // Ночь последнего дня обычно уже дома, а прошедшие ночи исправлять поздно
    return key < lastKey && key >= todayKey ? ("missing" as const) : undefined;
  };

  const plannerButton = canEdit && !tripOver && (
    <button
      type="button"
      onClick={() => setPlannerOpen(true)}
      className="w-full min-h-11 rounded-2xl border-2 border-dashed border-[#d946ef]/40 bg-[#d946ef]/5 text-[13px] font-medium flex items-center justify-center gap-1.5 text-foreground/90 hover:bg-[#d946ef]/10 transition-colors"
    >
      <Sparkles className="size-4 text-[#d946ef]" aria-hidden />
      Подобрать места с ИИ
    </button>
  );

  return (
    <div className="space-y-3 animate-fade-up pb-4 mx-auto w-full max-w-3xl">
      {/* max-w-3xl: нить дней — список для чтения, на 1280px строки
          растягивались в ~1200px с пустотой справа (аудит 2026-10-03) */}
      {/* Компактная шапка: где мы на маршруте. Цвет дня приглушён: на жёлтом или бирюзовом
          акценте белый текст иначе не читается */}
      <section
        className="rounded-3xl p-4 text-white shadow-lg"
        style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${accent} 62%, black) 0%, #1c1917 100%)` }}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight">{heroTitle}</h1>
            <p className="text-white/90 text-sm mt-0.5 text-pretty">{heroSubtitle}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {canShare ? (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                aria-label="Поделиться"
                title="Поделиться"
                className="min-h-11 min-w-11 rounded-xl bg-white/15 hover:bg-white/25 px-3 flex items-center justify-center gap-1.5 text-xs font-medium transition-[background-color,transform] active:scale-95"
              >
                <Share2 className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Поделиться</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab("map")}
                aria-label="На карте"
                title="На карте"
                className="min-h-11 min-w-11 rounded-xl bg-white/15 hover:bg-white/25 px-3 flex items-center justify-center gap-1.5 text-xs font-medium transition-[background-color,transform] active:scale-95"
              >
                <MapIcon className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">На карте</span>
              </button>
            )}
            <button
              type="button"
              onClick={downloadPdf}
              disabled={pdfLoading}
              aria-label="Скачать маршрут в PDF"
              title="Скачать маршрут в PDF"
              className="size-11 shrink-0 rounded-xl bg-white/15 hover:bg-white/25 grid place-items-center transition-[background-color,transform] active:scale-95 disabled:opacity-60"
            >
              {pdfLoading ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-1.5 flex-1 rounded-full bg-white/20 overflow-hidden">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: Math.min(1, Math.max(0, trip.placeProgress / 100)) }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full w-full origin-left rounded-full bg-white"
            />
          </div>
          <span className="shrink-0 text-xs text-white/90 tabular-nums">{trip.visitedPlaces} из {trip.totalPlaces} мест</span>
        </div>
      </section>

      {/* Липкая линейка дней + быстрое добавление места в выбранный день.
          Офсет — реальная высота хедера из --header-h (синхронизирует app-shell).
          Без backdrop-blur: рейка живёт под уже размытой шапкой, второй blur
          в стопке удваивает композитинг при скролле (аудит 2026-10-02) */}
      <div className="sticky top-[calc(var(--header-h,102px))] z-20 -mx-1 px-1 py-1 bg-background/95 rounded-xl">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <div ref={railRef} className="chip-rail no-scrollbar gap-1.5">
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
                const isToday = d.dayNumber === trip.currentDayNumber && !tripOver;
                return (
                  <button
                    key={d.id}
                    type="button"
                    data-day-chip={d.dayNumber}
                    // Повторное нажатие снимает выбор: «Все дни» к этому моменту обычно уже за краем полосы
                    onClick={() => selectDay(selectedDay === d.dayNumber ? null : d.dayNumber)}
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
            {/* Фейд на правом срезе: 10px-маска chip-rail не читается, чипы
                выглядели обрезанными (аудит 2026-10-03) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-background to-transparent"
            />
          </div>
          {/* Dashed, как «Добавить место» в карточке дня: сплошной оранжевый круг
              здесь клонировал глобальный FAB быстрого добавления */}
          {canEdit && (
            <button
              type="button"
              onClick={openAdd}
              disabled={!targetDay}
              className="shrink-0 size-11 rounded-full border-2 border-dashed border-border text-muted-foreground grid place-items-center hover:border-primary hover:text-primary active:scale-95 transition-colors disabled:opacity-50"
              title={targetDay ? "Добавить место" : "Сначала добавьте день"}
              aria-label="Добавить место"
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Жильё под рукой: одна строка про эту ночь, всё остальное на вкладке «Жильё» */}
      <LodgingStrip selectedDayKey={selectedDayKey} todayKey={todayKey} startKey={startKey} lastKey={lastKey} canEdit={canEdit} />

      {/* Планер: варианты мест от ИИ (не готовый маршрут), только для существующих дней.
          До старта он главный инструмент, а в поездке уступает верх сегодняшнему дню */}
      {isBefore && plannerButton}

      {/* Нить маршрута: дни-станции на общей линии */}
      <div className="relative">
        <div className="absolute left-[11px] top-3 bottom-3 w-0.5 rounded-full bg-border" aria-hidden="true" />
        <div className="space-y-3">
          {pastDays.length > 0 && (
            <div className="relative pl-8">
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                className="w-full min-h-11 rounded-2xl border border-border bg-card/60 px-3.5 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPast ? "Скрыть прошедшие дни" : `Прошедшие дни: ${pastDays.length}`}
                <ChevronDown className={cn("size-4 transition-transform", showPast && "rotate-180")} aria-hidden="true" />
              </button>
            </div>
          )}
          {shownDays.map((day) => {
            const isDayCurrent = day.dayNumber === trip.currentDayNumber;
            return (
              <DayCard
                // Ключ с режимом: иначе выбранный день оставался свёрнутым, каким был в общем списке
                key={selectedDay ? `${day.id}-selected` : day.id}
                day={day}
                currency={curSym}
                participantsCount={payers}
                isCurrent={isDayCurrent && inTrip}
                isPast={day.dayNumber < trip.currentDayNumber || tripOver}
                canEdit={canEdit}
                night={nightOf(day)}
                defaultExpanded={
                  // По умолчанию раскрыт только сегодня (или первый день до старта),
                  // при фильтре по дню — сам выбранный. Остальные дни не монтируем:
                  // так вход на вкладку не фризит на длинном маршруте.
                  selectedDay != null ? true : (isDayCurrent && inTrip) || (isBefore && day.id === dayList[0]?.id)
                }
                onOpenPlace={setOpenPlace}
                onAddPlace={
                  canEdit
                    ? (dayId) => {
                        const d = dayList.find((dd) => dd.id === dayId);
                        if (d) openAddForDay(d);
                      }
                    : undefined
                }
                onEditDay={canEdit ? setEditDay : undefined}
                onOpenLodging={() => setActiveTab("lodging")}
              />
            );
          })}
        </div>
      </div>

      {!isBefore && plannerButton}
      {canEdit && <AddDayButton onClick={() => setDaySheetOpen(true)} />}

      <PlaceDialog place={openPlace} currency={curSym} onClose={() => setOpenPlace(null)} />
      <AddPlaceSheet open={addOpen} onOpenChange={setAddOpen} initial={addData} />
      <DaySheet day={editDay} open={daySheetOpen || !!editDay} onOpenChange={(v) => { setDaySheetOpen(v); if (!v) setEditDay(null); }} />
      <ShareTripSheet open={shareOpen} onOpenChange={setShareOpen} tripId={tripId} tripTitle={trip.settings.title} canManage={isOwner} />
      {/* Планер смонтирован всегда: состояние черновика он сбрасывает сам при открытии */}
      <PlannerWizard open={plannerOpen} onOpenChange={setPlannerOpen} />
    </div>
  );
}

function ItinerarySkeleton() {
  return (
    <div className="space-y-3 animate-pulse mx-auto w-full max-w-3xl">
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
