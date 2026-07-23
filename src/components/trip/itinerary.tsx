"use client";

import { useDays, useUpdatePlace, useUploadPhoto, usePhotos } from "@/hooks/use-trip";
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
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function Itinerary() {
  const { data: days, isLoading } = useDays();
  const { selectedDay, setSelectedDay } = useTripStore();
  const [openPlace, setOpenPlace] = useState<Place | null>(null);

  if (isLoading || !days) return <div className="py-20 text-center text-muted-foreground">Загрузка маршрута…</div>;

  const filteredDays = selectedDay ? days.filter((d) => d.dayNumber === selectedDay) : days;

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Фильтр по дню */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
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

      {/* Дни */}
      {filteredDays.map((day) => (
        <DayCard key={day.id} day={day} onOpenPlace={setOpenPlace} />
      ))}

      <PlaceDialog place={openPlace} onClose={() => setOpenPlace(null)} />
    </div>
  );
}

function DayCard({ day, onOpenPlace }: { day: Day; onOpenPlace: (p: Place) => void }) {
  const [expanded, setExpanded] = useState(true);
  const visited = day.places.filter((p) => p.status === "visited").length;
  const progress = day.places.length ? (visited / day.places.length) * 100 : 0;

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-accent/40 transition-colors text-left"
      >
        <div
          className="size-11 rounded-xl grid place-items-center text-white font-bold shrink-0 shadow-md"
          style={{ background: day.accentColor ?? "#f97316" }}
        >
          {day.dayNumber}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="size-3" /> {day.city}
          </div>
          <div className="font-semibold text-sm truncate">{day.title}</div>
          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: day.accentColor ?? "#f97316" }} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-medium">{visited}/{day.places.length}</div>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </div>
      </button>

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
    <div
      onClick={onOpen}
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors group",
        visited ? "bg-green-500/5" : "hover:bg-accent"
      )}
    >
      <button onClick={toggle} className="shrink-0">
        {visited ? (
          <CheckCircle2 className="size-6 text-green-500" />
        ) : (
          <Circle className="size-6 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </button>
      <span className="text-xl shrink-0">{meta?.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium leading-tight", visited && "line-through opacity-60")}>{place.name}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
          {place.timeOfDay && (
            <span className="flex items-center gap-0.5"><Clock className="size-2.5" /> {timeLabel(place.timeOfDay)}</span>
          )}
          {place.budget ? (
            <span className="flex items-center gap-0.5"><DollarSign className="size-2.5" /> {place.budget}</span>
          ) : null}
          {place.rating ? <span className="flex items-center gap-0.5 text-amber-500"><Star className="size-2.5 fill-current" /> {place.rating}</span> : null}
        </div>
      </div>
      <div className="size-1.5 rounded-full shrink-0" style={{ background: visited ? "#22c55e" : accentColor }} />
    </div>
  );
}

function PlaceDialog({ place, onClose }: { place: Place | null; onClose: () => void }) {
  const update = useUpdatePlace();
  const upload = useUploadPhoto();
  const inputRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const { data: trip } = useDays();

  const day = trip?.find((d) => d.id === place?.dayId);
  const photos = day?.photos.filter((p) => p.placeId === place?.id) ?? [];

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
    fd.append("participantId", trip?.[0] ? "" : "");
    await upload.mutateAsync(fd);
    toast.success("Фото добавлено к месту 📸");
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-end sm:place-items-center p-0 sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto"
        >
          {/* header */}
          <div className="sticky top-0 bg-card/90 backdrop-blur px-5 py-4 border-b border-border flex items-start gap-3">
            <div className="size-12 rounded-xl grid place-items-center text-2xl shrink-0" style={{ background: `${meta?.color}22` }}>
              {meta?.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <MapPin className="size-3" /> День {day?.dayNumber} · {day?.city} · {meta?.label}
              </div>
              <h2 className="font-bold text-lg leading-tight">{place.name}</h2>
            </div>
            <button onClick={onClose} className="size-8 rounded-full hover:bg-accent grid place-items-center shrink-0">
              <X className="size-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
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
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
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
