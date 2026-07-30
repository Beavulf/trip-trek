"use client";

import { useDays, useUpdatePlace, useUploadPhoto, useDeletePlace, useAddDay, useDeleteDay } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { CATEGORY_META, type Place, type Day } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Clock,
  DollarSign,
  MapPin,
  Star,
  Camera,
  X,
  Loader2,
  ChevronDown,
  NotebookPen,
  Plus,
  Trash2,
  Navigation,
  CalendarPlus,
} from "lucide-react";
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AddPlaceSheet, type AddPlaceData } from "./add-place-sheet";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

export function Itinerary() {
  const { data: days, isLoading } = useDays();
  const { selectedDay, setSelectedDay } = useTripStore();
  const [openPlace, setOpenPlace] = useState<Place | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addData, setAddData] = useState<AddPlaceData | null>(null);

  if (isLoading || !days) return <ItinerarySkeleton />;

  const filteredDays = selectedDay ? days.filter((d) => d.dayNumber === selectedDay) : days;

  // координаты центра города выбранного дня (для добавления места)
  const currentDay = selectedDay ? days.find((d) => d.dayNumber === selectedDay) : days[0];

  const openAdd = () => {
    // дефолтные координаты — центр города текущего дня
    const cityCoords: Record<string, { lat: number; lng: number }> = {
      guangzhou: { lat: 23.1291, lng: 113.2644 },
      shenzhen: { lat: 22.5431, lng: 114.0579 },
      hongkong: { lat: 22.3193, lng: 114.1694 },
      macau: { lat: 22.1987, lng: 113.5439 },
      tokyo: { lat: 35.6762, lng: 139.6503 },
      paris: { lat: 48.8566, lng: 2.3522 },
      bangkok: { lat: 13.7563, lng: 100.5018 },
      phuket: { lat: 7.8804, lng: 98.3923 },
    };
    const c = (currentDay && cityCoords[currentDay.cityKey]) || cityCoords.guangzhou;
    setAddData({ lat: c.lat, lng: c.lng, dayId: currentDay?.id });
    setAddOpen(true);
  };

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Кнопка добавления + фильтр по дню */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 flex-1">
        <button
          onClick={() => setSelectedDay(null)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
            !selectedDay ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
          )}
        >
          Все дни
        </button>
        {days.map((d) => {
          const visited = d.places.filter((p) => p.status === "visited").length;
          return (
            <button
              key={d.id}
              onClick={() => setSelectedDay(d.dayNumber)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                selectedDay === d.dayNumber ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ background: d.accentColor ?? "#f97316" }}
              />
              День {d.dayNumber}
              <span className="opacity-70">{visited}/{d.places.length}</span>
            </button>
          );
        })}
        </div>
        <button
          onClick={openAdd}
          className="shrink-0 size-9 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-md active:scale-95 transition-transform"
          title="Добавить место"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {/* Дни */}
      {filteredDays.map((day) => (
        <DayCard key={day.id} day={day} onOpenPlace={setOpenPlace} />
      ))}

      {/* Кнопка добавить день */}
      <AddDayButton />

      <PlaceDialog place={openPlace} onClose={() => setOpenPlace(null)} />
      <AddPlaceSheet open={addOpen} onOpenChange={setAddOpen} initial={addData} />
    </div>
  );
}

function DayCard({ day, onOpenPlace }: { day: Day; onOpenPlace: (p: Place) => void }) {
  const [expanded, setExpanded] = useState(true);
  const visited = day.places.filter((p) => p.status === "visited").length;
  const progress = day.places.length ? (visited / day.places.length) * 100 : 0;

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden card-hover">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
        className="w-full flex items-center gap-3 p-4 hover:bg-accent/40 transition-colors text-left active:bg-accent/60 cursor-pointer"
      >
        <div
          className="size-11 rounded-xl grid place-items-center text-white font-bold shrink-0 shadow-lg"
          style={{ background: day.accentColor ?? "#f97316", boxShadow: `0 4px 12px -2px ${day.accentColor ?? "#f97316"}40` }}
        >
          {day.dayNumber}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="size-3" /> {day.city}
          </div>
          <div className="font-semibold text-sm truncate">{day.title}</div>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: day.accentColor ?? "#f97316" }}
            />
          </div>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <DeleteDayButton dayId={day.id} dayNumber={day.dayNumber} />
            <div className="text-xs font-medium tabular-nums">{visited}/{day.places.length}</div>
          </div>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="size-4 text-muted-foreground" />
          </motion.div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-1.5">
              {day.places.map((place) => (
                <PlaceRow key={place.id} place={place} accentColor={day.accentColor ?? "#f97316"} onOpen={() => onOpenPlace(place)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlaceRow({ place, accentColor, onOpen }: { place: Place; accentColor: string; onOpen: () => void }) {
  const update = useUpdatePlace();
  const meta = CATEGORY_META[place.category];
  const visited = place.status === "visited";

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    update.mutate({ id: place.id, status: visited ? "planned" : "visited" });
    toast(visited ? "Отмечено как запланировано" : "Посещено! 🎉", {
      description: place.name,
    });
  };

  return (
    <motion.div
      layout
      onClick={onOpen}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors group relative overflow-hidden",
        visited ? "bg-green-500/5" : "hover:bg-accent"
      )}
    >
      {/* Левая цветная полоска категории */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: visited ? "#22c55e" : meta?.color ?? accentColor }}
      />
      <button onClick={toggle} className="shrink-0 ml-1">
        {visited ? (
          <CheckCircle2 className="size-6 text-green-500" />
        ) : (
          <Circle className="size-6 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </button>
      <div
        className="size-9 rounded-lg grid place-items-center text-lg shrink-0 transition-transform group-hover:scale-110"
        style={{ background: `${meta?.color}22` }}
      >
        {meta?.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium leading-tight", visited && "line-through opacity-60")}>{place.name}</div>
        {/* Адрес */}
        {place.address && (
          <div className="flex items-start gap-1 text-[10px] text-muted-foreground mt-0.5">
            <MapPin className="size-2.5 mt-0.5 shrink-0" />
            <span className="line-clamp-1">{place.address}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide"
            style={{ background: `${meta?.color}18`, color: meta?.color }}
          >
            {meta?.label}
          </span>
          {place.timeOfDay && (
            <span className="flex items-center gap-0.5"><Clock className="size-2.5" /> {timeLabel(place.timeOfDay)}</span>
          )}
          {place.budget ? (
            <span className="flex items-center gap-0.5"><DollarSign className="size-2.5" /> {place.budget}</span>
          ) : null}
          {place.rating ? <span className="flex items-center gap-0.5 text-amber-500"><Star className="size-2.5 fill-current" /> {place.rating}</span> : null}
        </div>
        {/* Кнопка "как добраться" */}
        <a
          href={`https://www.openstreetmap.org/directions?from=&to=${place.lat}%2C${place.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-1"
        >
          <Navigation className="size-2.5" /> Как добраться
        </a>
      </div>
      {visited && (
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">
          ✓
        </span>
      )}
    </motion.div>
  );
}

function PlaceDialog({ place, onClose }: { place: Place | null; onClose: () => void }) {
  useBodyScrollLock(!!place);
  const update = useUpdatePlace();
  const upload = useUploadPhoto();
  const inputRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const { data: trip } = useDays();

  const day = trip?.find((d) => d.id === place?.dayId);
  const photos = day?.photos.filter((p) => p.placeId === place?.id) ?? [];

  // Рендерим через портал на document.body — избегаем stacking context от motion.div
  if (typeof document === "undefined") return null;
  if (!place) return null;
  const meta = CATEGORY_META[place.category];
  const visited = place.status === "visited";

  const saveNotes = () => {
    update.mutate({ id: place.id, notes });
    toast.success("Заметка сохранена");
  };

  const onFile = async (f: File) => {
    if (!place.dayId) return;
    const fd = new FormData();
    fd.append("file", f);
    fd.append("dayId", place.dayId);
    fd.append("placeId", place.id);
    await upload.mutateAsync(fd);
    toast.success("Фото добавлено к месту 📸");
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-lg max-h-[88vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto flex flex-col"
        >
          {/* handle bar для мобильного */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* header */}
          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 sm:px-5 py-3 border-b border-border flex items-start gap-3 shrink-0">
            <div className="size-11 sm:size-12 rounded-xl grid place-items-center text-xl sm:text-2xl shrink-0" style={{ background: `${meta?.color}22` }}>
              {meta?.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                <MapPin className="size-3 shrink-0" />
                <span>День {day?.dayNumber} · {day?.city}</span>
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase"
                  style={{ background: `${meta?.color}18`, color: meta?.color }}
                >
                  {meta?.label}
                </span>
              </div>
              <h2 className="font-bold text-base sm:text-lg leading-tight mt-0.5">{place.name}</h2>
              {place.address && (
                <div className="text-[11px] text-muted-foreground mt-0.5 flex items-start gap-1">
                  <MapPin className="size-2.5 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{place.address}</span>
                </div>
              )}
            </div>
            <button onClick={onClose} className="size-8 rounded-full hover:bg-accent grid place-items-center shrink-0" aria-label="Закрыть">
              <X className="size-4" />
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
            {place.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{place.description}</p>
            )}

            {/* quick actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  update.mutate({ id: place.id, status: visited ? "planned" : "visited" });
                  toast(visited ? "Снято" : "Отмечено посещённым 🎉");
                }}
                className={cn(
                  "rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
                  visited ? "bg-green-500/10 text-green-600 border border-green-500/30" : "bg-primary text-primary-foreground"
                )}
              >
                <CheckCircle2 className="size-4" />
                {visited ? "Посещено" : "Отметить"}
              </button>
              <button
                onClick={() => inputRef.current?.click()}
                className="rounded-xl py-2.5 text-sm font-medium bg-secondary text-secondary-foreground flex items-center justify-center gap-2 hover:bg-accent"
              >
                <Camera className="size-4" /> Фото
              </button>
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </div>

            {/* рейтинг */}
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Оценка</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      update.mutate({ id: place.id, rating: s === place.rating ? null : s });
                    }}
                  >
                    <Star
                      className={cn(
                        "size-7 transition-transform hover:scale-110",
                        (place.rating ?? 0) >= s ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* заметки */}
            <div>
              <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><NotebookPen className="size-3" /> Заметки</div>
              <textarea
                value={notes || place.notes || ""}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Впечатления, советы…"
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
              />
              {notes && notes !== (place.notes || "") && (
                <button onClick={saveNotes} className="mt-1.5 text-xs text-primary hover:underline">
                  Сохранить заметку
                </button>
              )}
            </div>

            {/* фото места */}
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Фото ({photos.length})</div>
              {photos.length === 0 ? (
                <div className="text-xs text-muted-foreground/60 italic">Пока нет фото</div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {photos.map((ph) => (
                    <div key={ph.id} className="aspect-square rounded-lg overflow-hidden bg-muted">
                      <img src={ph.url} alt={ph.caption || ""} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* удалить место */}
            <DeletePlaceButton placeId={place.id} placeName={place.name} onDeleted={onClose} />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

function DeletePlaceButton({ placeId, placeName, onDeleted }: { placeId: string; placeName: string; onDeleted: () => void }) {
  const del = useDeletePlace();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="w-full rounded-lg border border-red-500/30 text-red-500 py-2 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-red-500/5 transition-colors"
      >
        <Trash2 className="size-3.5" /> Удалить место
      </button>
    );
  }
  return (
    <div className="flex gap-2">
      <button
        onClick={() => setConfirm(false)}
        className="flex-1 rounded-lg bg-secondary py-2 text-xs font-medium"
      >
        Отмена
      </button>
      <button
        onClick={() => {
          del.mutate(placeId);
          toast.success("Место удалено");
          onDeleted();
        }}
        className="flex-1 rounded-lg bg-red-500 text-white py-2 text-xs font-medium flex items-center justify-center gap-1.5"
      >
        <Trash2 className="size-3.5" /> Удалить «{placeName.slice(0, 12)}{placeName.length > 12 ? "…" : ""}»
      </button>
    </div>
  );
}

function timeLabel(t: string | null) {
  switch (t) {
    case "morning": return "Утро";
    case "afternoon": return "День";
    case "evening": return "Вечер";
    default: return "";
  }
}

function ItinerarySkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {/* Фильтр дней */}
      <div className="flex gap-1.5 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-muted" />
        ))}
        <div className="size-9 rounded-full bg-muted ml-auto" />
      </div>
      {/* Карточки дней */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-1/4" />
              <div className="h-2.5 bg-muted rounded w-1/2" />
            </div>
            <div className="size-4 bg-muted rounded" />
          </div>
          <div className="mt-3 space-y-1.5">
            {[0, 1].map((j) => (
              <div key={j} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50">
                <div className="size-6 rounded-full bg-muted" />
                <div className="size-9 rounded-lg bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-2 bg-muted rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Кнопка добавления нового дня
function AddDayButton() {
  const addDay = useAddDay();
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState("");
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#f97316");

  useBodyScrollLock(open);

  const COLORS = ["#f97316", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"];

  const submit = async () => {
    await addDay.mutateAsync({
      city: city.trim() || "Новый город",
      cityKey: "custom",
      title: title.trim() || undefined,
      accentColor: color,
    });
    toast.success("День добавлен! 📅");
    setCity("");
    setTitle("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors"
      >
        <CalendarPlus className="size-5" />
        <span className="text-sm font-medium">Добавить день</span>
      </button>
    );
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-y-auto max-h-[90vh]"
        >
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2">
              <CalendarPlus className="size-5 text-primary" /> Новый день
            </h2>
            <button onClick={() => setOpen(false)} className="size-8 rounded-full hover:bg-accent grid place-items-center">
              <X className="size-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Город</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Например, Шанхай"
                autoFocus
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Название дня (необязательно)</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например, Переезд в Шанхай"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Цвет дня</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-9 rounded-full transition-all",
                      color === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : "opacity-60 hover:opacity-100"
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={submit}
              disabled={addDay.isPending}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {addDay.isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
              {addDay.isPending ? "Создание…" : "Добавить день"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// Кнопка удаления дня (внутри DayCard)
function DeleteDayButton({ dayId, dayNumber }: { dayId: string; dayNumber: number }) {
  const deleteDay = useDeleteDay();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
        className="size-7 rounded-lg hover:bg-destructive/10 hover:text-destructive grid place-items-center transition-colors text-muted-foreground"
        title="Удалить день"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => {
          deleteDay.mutate(dayId, {
            onSuccess: () => toast.success(`День ${dayNumber} удалён`),
            onError: (e) => toast.error(e.message),
          });
        }}
        disabled={deleteDay.isPending}
        className="text-[10px] bg-destructive text-destructive-foreground px-2 py-1 rounded-lg font-medium"
      >
        {deleteDay.isPending ? "…" : "Удалить?"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="text-[10px] bg-secondary px-2 py-1 rounded-lg"
      >
        Отмена
      </button>
    </div>
  );
}
