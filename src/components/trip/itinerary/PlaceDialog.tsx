"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  NotebookPen,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  usePhotos,
  useUpdatePlace,
  useUploadPhoto,
  useDeletePlace,
  useDays,
} from "@/hooks/use-trip";
import { CATEGORY_META, type Place } from "@/lib/types";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { compressImageForUpload, ImageCompressError } from "@/lib/image-compress";

interface PlaceDialogProps {
  place: Place | null;
  onClose: () => void;
}

export function PlaceDialog({ place, onClose }: PlaceDialogProps) {
  useBodyScrollLock(!!place);
  if (typeof document === "undefined" || !place) return null;

  return createPortal(
    <AnimatePresence>
      <PlaceDialogBody key={place.id} place={place} onClose={onClose} />
    </AnimatePresence>,
    document.body
  );
}

function PlaceDialogBody({ place, onClose }: { place: Place; onClose: () => void }) {
  const update = useUpdatePlace();
  const upload = useUploadPhoto();
  const inputRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState(place.notes || "");
  const [uploading, setUploading] = useState(false);
  const { data: days } = useDays();
  const { data: placePhotos } = usePhotos(undefined, place.id);

  useEffect(() => {
    setNotes(place.notes || "");
  }, [place.id, place.notes]);

  const day = days?.find((d) => d.id === place.dayId);
  const photos = Array.isArray(placePhotos) ? placePhotos : [];
  const meta = CATEGORY_META[place.category];
  const visited = place.status === "visited";

  const saveNotes = async () => {
    try {
      await update.mutateAsync({ id: place.id, notes });
      toast.success("Заметка сохранена");
    } catch {
      toast.error("Не удалось сохранить заметку");
    }
  };

  const onFile = async (f: File) => {
    if (!place.dayId) return;
    setUploading(true);
    try {
      const compressed = await compressImageForUpload(f);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("dayId", place.dayId);
      fd.append("placeId", place.id);
      await upload.mutateAsync(fd);
      toast.success("Фото добавлено к месту 📸");
    } catch (e) {
      toast.error(e instanceof ImageCompressError ? e.message : "Не удалось загрузить фото");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const toggleVisited = async () => {
    try {
      await update.mutateAsync({ id: place.id, status: visited ? "planned" : "visited" });
      toast(visited ? "Снято" : "Отмечено посещённым 🎉");
    } catch {
      toast.error("Не удалось обновить статус");
    }
  };

  return (
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
        className="bg-card w-full sm:max-w-lg max-h-[88vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto flex flex-col pb-[env(safe-area-inset-bottom)]"
      >
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="sticky top-0 bg-card/95 backdrop-blur px-4 sm:px-5 py-3 border-b border-border flex items-start gap-3 shrink-0">
          <div
            className="size-11 sm:size-12 rounded-xl grid place-items-center text-xl sm:text-2xl shrink-0"
            style={{ background: `${meta?.color}22` }}
          >
            {meta?.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
              <MapPin className="size-3 shrink-0" />
              <span>
                День {day?.dayNumber} · {day?.city}
              </span>
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
          <button
            type="button"
            onClick={onClose}
            className="size-10 rounded-full hover:bg-accent grid place-items-center shrink-0"
            aria-label="Закрыть"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {place.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{place.description}</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={toggleVisited}
              disabled={update.isPending}
              className={cn(
                "rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors min-h-11",
                visited
                  ? "bg-green-500/10 text-green-600 border border-green-500/30"
                  : "bg-primary text-primary-foreground"
              )}
            >
              <CheckCircle2 className="size-4" />
              {visited ? "Посещено" : "Отметить"}
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-xl py-3 text-sm font-medium bg-secondary text-secondary-foreground flex items-center justify-center gap-2 hover:bg-accent min-h-11 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              Фото
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Оценка</div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  className="size-11 grid place-items-center"
                  onClick={async () => {
                    try {
                      await update.mutateAsync({
                        id: place.id,
                        rating: s === place.rating ? null : s,
                      });
                    } catch {
                      toast.error("Не удалось сохранить оценку");
                    }
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

          <div>
            <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <NotebookPen className="size-3" /> Заметки
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Впечатления, советы…"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base input-mobile resize-none"
            />
            {notes !== (place.notes || "") && (
              <button
                type="button"
                onClick={saveNotes}
                disabled={update.isPending}
                className="mt-1.5 text-xs text-primary hover:underline min-h-11 px-1"
              >
                Сохранить заметку
              </button>
            )}
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Фото ({photos.length})</div>
            {photos.length === 0 ? (
              <div className="text-xs text-muted-foreground/60 italic">Пока нет фото</div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {photos.map((ph) => (
                  <div key={ph.id} className="aspect-square rounded-lg overflow-hidden bg-muted">
                    <img
                      src={ph.thumbUrl || ph.url}
                      alt={ph.caption || ""}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <DeletePlaceButton placeId={place.id} placeName={place.name} onDeleted={onClose} />
        </div>
      </motion.div>
    </motion.div>
  );
}

function DeletePlaceButton({
  placeId,
  placeName,
  onDeleted,
}: {
  placeId: string;
  placeName: string;
  onDeleted: () => void;
}) {
  const del = useDeletePlace();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="w-full rounded-lg border border-red-500/30 text-red-500 py-3 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-red-500/5 transition-colors min-h-11"
      >
        <Trash2 className="size-3.5" /> Удалить место
      </button>
    );
  }
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setConfirm(false)}
        className="flex-1 rounded-lg bg-secondary py-3 text-xs font-medium min-h-11"
      >
        Отмена
      </button>
      <button
        type="button"
        disabled={del.isPending}
        onClick={async () => {
          try {
            await del.mutateAsync(placeId);
            toast.success("Место удалено");
            onDeleted();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Не удалось удалить");
          }
        }}
        className="flex-1 rounded-lg bg-red-500 text-white py-3 text-xs font-medium flex items-center justify-center gap-1.5 min-h-11 disabled:opacity-50"
      >
        {del.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        Удалить «{placeName.slice(0, 12)}
        {placeName.length > 12 ? "…" : ""}»
      </button>
    </div>
  );
}
