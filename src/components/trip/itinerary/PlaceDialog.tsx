"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  MapPin,
  NotebookPen,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useDays, useUpdatePlace, useUploadPhoto, useDeletePlace } from "@/hooks/use-trip";
import { CATEGORY_META, type Place } from "@/lib/types";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PlaceDialogProps {
  place: Place | null;
  onClose: () => void;
}

export function PlaceDialog({ place, onClose }: PlaceDialogProps) {
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
