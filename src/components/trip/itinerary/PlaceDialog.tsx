"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MapPin,
  Navigation,
  NotebookPen,
  Pencil,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  usePhotos,
  useDeletePhoto,
  useUpdatePhoto,
  useUpdatePlace,
  useUploadPhoto,
  useDeletePlace,
  useRouteDays,
  useTrip,
} from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { useTripStore } from "@/lib/trip-store";
import { CATEGORY_META, CATEGORY_SHORT, type Place, type Photo } from "@/lib/types";
import { TIME_SLOTS, timeLabel } from "@/lib/time-of-day";
import { googleDirectionsUrl } from "@/lib/place-links";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { compressImageForUpload, ImageCompressError } from "@/lib/image-compress";
import { PhotoLightbox } from "../photo-lightbox";

interface PlaceDialogProps {
  place: Place | null;
  /** Символ валюты поездки для поля бюджета */
  currency?: string;
  onClose: () => void;
}

export function PlaceDialog({ place, currency, onClose }: PlaceDialogProps) {
  useBodyScrollLock(!!place);
  if (typeof document === "undefined") return null;

  // place проверяем внутри AnimatePresence — иначе unmount убивает exit-анимацию
  return createPortal(
    <AnimatePresence>
      {place && (
        <PlaceDialogBody key={place.id} place={place} currency={currency} onClose={onClose} />
      )}
    </AnimatePresence>,
    document.body
  );
}

function PlaceDialogBody({ place, currency, onClose }: { place: Place; currency?: string; onClose: () => void }) {
  const update = useUpdatePlace();
  const upload = useUploadPhoto();
  const updPhoto = useUpdatePhoto();
  const delPhoto = useDeletePhoto();
  const inputRef = useRef<HTMLInputElement>(null);
  // Фокус-трап и возврат фокуса; Escape ведёт локальный обработчик ниже (свернуть форму → закрыть)
  const panelRef = useDialogA11y<HTMLDivElement>(true);
  const [notes, setNotes] = useState(place.notes || "");
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const { data: days } = useRouteDays();
  const { setActiveTab, setMapFocusTarget } = useTripStore();
  const { data: placePhotos } = usePhotos(undefined, place.id);

  // Поля формы редактирования
  const [name, setName] = useState(place.name);
  const [category, setCategory] = useState(place.category);
  const [timeOfDay, setTimeOfDay] = useState(place.timeOfDay || "");
  const [budget, setBudget] = useState(place.budget != null ? String(place.budget) : "");
  const [address, setAddress] = useState(place.address || "");
  const [description, setDescription] = useState(place.description || "");

  // Свежая версия места из кэша дней — статус/рейтинг/заметки отражаются сразу
  const fresh: Place =
    days?.flatMap((d) => d.places).find((p) => p.id === place.id) ?? place;

  useEffect(() => {
    setNotes(fresh.notes || "");
  }, [fresh.id, fresh.notes]);

  // Escape: сначала сворачивает форму редактирования, затем закрывает диалог
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editing) {
        setEditing(false);
        resetForm();
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const resetForm = () => {
    setName(fresh.name);
    setCategory(fresh.category);
    setTimeOfDay(fresh.timeOfDay || "");
    setBudget(fresh.budget != null ? String(fresh.budget) : "");
    setAddress(fresh.address || "");
    setDescription(fresh.description || "");
  };

  const day = days?.find((d) => d.id === fresh.dayId) ?? days?.find((d) => d.id === place.dayId);
  const photos = Array.isArray(placePhotos) ? placePhotos : [];

  // Права на фото: автор или владелец поездки
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const { data: tripCtx } = useTrip();
  const isOwner = tripCtx?.participants?.find((p) => p.id === currentUserId)?.role === "owner";

  const togglePhotoFavorite = (p: Photo) => {
    updPhoto.mutate(
      { id: p.id, patch: { isFavorite: !p.isFavorite } },
      {
        onSuccess: () => toast.success(p.isFavorite ? "Убрано из избранного" : "В избранном ⭐"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось обновить"),
      },
    );
  };

  const savePhotoEdit = async (photoId: string, patch: { caption?: string | null; dayId?: string }) => {
    try {
      await updPhoto.mutateAsync({ id: photoId, patch });
      toast.success("Изменения сохранены");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
      return false;
    }
  };

  const deletePhoto = (photoId: string) => {
    delPhoto.mutate(photoId, {
      onSuccess: () => toast.success("Фото удалено"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось удалить"),
    });
  };
  const meta = CATEGORY_META[fresh.category];
  const visited = fresh.status === "visited";

  const editDirty =
    name.trim() !== fresh.name ||
    category !== fresh.category ||
    timeOfDay !== (fresh.timeOfDay || "") ||
    budget !== (fresh.budget != null ? String(fresh.budget) : "") ||
    address !== (fresh.address || "") ||
    description !== (fresh.description || "");

  const saveNotes = async () => {
    try {
      await update.mutateAsync({ id: fresh.id, notes });
      toast.success("Заметка сохранена");
    } catch {
      toast.error("Не удалось сохранить заметку");
    }
  };

  const saveEdits = async () => {
    if (!name.trim()) {
      toast.error("Название не может быть пустым");
      return;
    }
    try {
      await update.mutateAsync({
        id: fresh.id,
        name: name.trim(),
        category,
        timeOfDay: timeOfDay || null,
        budget: budget.trim() ? parseFloat(budget) : null,
        address: address.trim() || null,
        description: description.trim() || null,
      });
      toast.success("Изменения сохранены");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить изменения");
    }
  };

  const onFile = async (f: File) => {
    if (!fresh.dayId) return;
    setUploading(true);
    try {
      const compressed = await compressImageForUpload(f);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("dayId", fresh.dayId);
      fd.append("placeId", fresh.id);
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
      await update.mutateAsync({ id: fresh.id, status: visited ? "planned" : "visited" });
      toast(visited ? "Снято" : "Отмечено посещённым 🎉");
    } catch {
      toast.error("Не удалось обновить статус");
    }
  };

  const focusOnMap = () => {
    setMapFocusTarget({ lat: fresh.lat, lng: fresh.lng, placeId: fresh.id });
    setActiveTab("map");
    onClose();
  };

  const moveToDay = async (targetDayId: string, dayNumber: number) => {
    if (targetDayId === fresh.dayId) return;
    try {
      await update.mutateAsync({ id: fresh.id, dayId: targetDayId });
      toast.success(`Перенесено в День ${dayNumber}`, { description: fresh.name });
    } catch {
      toast.error("Не удалось перенести место");
    }
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={fresh.name}
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full sm:max-w-lg max-h-[88vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto overscroll-contain flex flex-col pb-[env(safe-area-inset-bottom)]"
      >
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="sticky top-0 bg-card/95 backdrop-blur px-4 sm:px-5 py-3 border-b border-border flex items-start gap-3 shrink-0 z-10">
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
            <h2 className="font-bold text-base sm:text-lg leading-tight mt-0.5">{fresh.name}</h2>
            {fresh.address && (
              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-start gap-1">
                <MapPin className="size-2.5 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{fresh.address}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-11 rounded-full hover:bg-accent grid place-items-center shrink-0"
            aria-label="Закрыть"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {fresh.description && !editing && (
            <p className="text-sm text-muted-foreground leading-relaxed">{fresh.description}</p>
          )}

          {/* Главные действия */}
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
            <a
              href={googleDirectionsUrl(fresh.lat, fresh.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl py-3 text-sm font-medium bg-primary text-primary-foreground flex items-center justify-center gap-2 min-h-11"
            >
              <Navigation className="size-4" />
              Маршрут
            </a>
            <button
              type="button"
              onClick={focusOnMap}
              className="rounded-xl py-3 text-sm font-medium bg-secondary text-secondary-foreground flex items-center justify-center gap-2 hover:bg-accent min-h-11"
            >
              <MapPin className="size-4" />
              На карте
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

          {/* Редактирование деталей — раскрывающийся блок */}
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => (editing ? (setEditing(false), resetForm()) : setEditing(true))}
              aria-expanded={editing}
              className="w-full flex items-center gap-2 px-3 min-h-11 text-sm font-medium hover:bg-accent/50 transition-colors text-left"
            >
              <Pencil className="size-3.5 text-muted-foreground" />
              {editing ? "Свернуть детали" : "Название, категория, время…"}
              <ChevronDown className={cn("size-4 ml-auto text-muted-foreground transition-transform", editing && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {editing && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 pt-1 space-y-3 border-t border-border">
                    <div>
                      <label htmlFor="place-name" className="text-xs text-muted-foreground mb-1 block">Название</label>
                      <input
                        id="place-name"
                        name="name"
                        type="text"
                        autoComplete="off"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm input-mobile"
                      />
                    </div>
                    <div>
                      <div id="place-category-label" className="text-xs text-muted-foreground mb-1.5">Категория</div>
                      <div role="group" aria-labelledby="place-category-label" className="grid grid-cols-3 gap-1.5">
                        {Object.entries(CATEGORY_META).map(([k, v]) => (
                          <button
                            key={k}
                            type="button"
                            title={v.label}
                            onClick={() => setCategory(k)}
                            aria-pressed={category === k}
                            className={cn(
                              "flex flex-col items-center gap-0.5 rounded-lg py-1.5 min-h-11 text-[10px] font-medium transition-colors border",
                              category === k
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-secondary/50 hover:bg-accent"
                            )}
                          >
                            <span className="text-base leading-none" aria-hidden="true">{v.emoji}</span>
                            {CATEGORY_SHORT[k] ?? v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div id="place-time-label" className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><CalendarClock className="size-3" /> Время суток</div>
                      <div role="group" aria-labelledby="place-time-label" className="grid grid-cols-3 gap-1.5">
                        {TIME_SLOTS.map((s) => (
                          <button
                            key={s.key}
                            type="button"
                            onClick={() => setTimeOfDay(timeOfDay === s.key ? "" : s.key)}
                            aria-pressed={timeOfDay === s.key}
                            className={cn(
                              "rounded-lg py-2 min-h-11 text-xs font-medium transition-colors border",
                              timeOfDay === s.key
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-secondary/50 hover:bg-accent"
                            )}
                          >
                            {timeLabel(s.key, { emoji: true })}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="place-budget" className="text-xs text-muted-foreground mb-1 block">Бюджет, {currency ?? "$"}</label>
                        <input
                          id="place-budget"
                          name="budget"
                          type="number"
                          inputMode="decimal"
                          autoComplete="off"
                          value={budget}
                          onChange={(e) => setBudget(e.target.value)}
                          placeholder="0"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm input-mobile"
                        />
                      </div>
                      <div>
                        <label htmlFor="place-address" className="text-xs text-muted-foreground mb-1 block">Адрес</label>
                        <input
                          id="place-address"
                          name="address"
                          type="text"
                          autoComplete="off"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Адрес…"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm input-mobile"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="place-description" className="text-xs text-muted-foreground mb-1 block">Описание</label>
                      <textarea
                        id="place-description"
                        name="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Чем интересно место…"
                        rows={2}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm input-mobile resize-none"
                      />
                    </div>
                    {editDirty && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => (setEditing(false), resetForm())}
                          className="flex-1 rounded-lg bg-secondary py-2.5 min-h-11 text-sm font-medium"
                        >
                          Отменить
                        </button>
                        <button
                          type="button"
                          onClick={saveEdits}
                          disabled={update.isPending}
                          className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 min-h-11 text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                          Сохранить
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Перенести на другой день */}
          {days && days.length > 1 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Перенести на день</div>
              <div className="chip-rail no-scrollbar gap-1.5 pb-1">
                {days.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => moveToDay(d.id, d.dayNumber)}
                    aria-pressed={d.id === fresh.dayId}
                    className={cn(
                      "shrink-0 min-h-11 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5",
                      d.id === fresh.dayId
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border hover:bg-accent"
                    )}
                  >
                    <span className="size-2 rounded-full" style={{ background: d.accentColor ?? "#f97316" }} />
                    День {d.dayNumber}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Оценка */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Оценка</div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`Оценка ${s}`}
                  aria-pressed={(fresh.rating ?? 0) === s}
                  className="size-11 grid place-items-center active:scale-90 transition-transform"
                  onClick={async () => {
                    try {
                      await update.mutateAsync({
                        id: fresh.id,
                        rating: s === fresh.rating ? null : s,
                      });
                    } catch {
                      toast.error("Не удалось сохранить оценку");
                    }
                  }}
                >
                  <Star
                    className={cn(
                      "size-7 transition-transform hover:scale-110",
                      (fresh.rating ?? 0) >= s ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Заметки */}
          <div>
            <label htmlFor="place-notes" className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <NotebookPen className="size-3" /> Заметки
            </label>
            <textarea
              id="place-notes"
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Впечатления, советы…"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base input-mobile resize-none"
            />
            {notes !== (fresh.notes || "") && (
              <button
                type="button"
                onClick={saveNotes}
                disabled={update.isPending}
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline min-h-11 px-1"
              >
                Сохранить заметку
              </button>
            )}
          </div>

          {/* Фото */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Фото ({photos.length})</div>
            {photos.length === 0 ? (
              <div className="text-xs text-muted-foreground/60 italic">Пока нет фото — сделайте первое на месте</div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {photos.map((ph, i) => (
                  <button
                    key={ph.id}
                    type="button"
                    onClick={() => setLightboxIdx(i)}
                    className="aspect-square rounded-lg overflow-hidden bg-muted active:scale-95 transition-transform"
                    aria-label={`Открыть фото ${i + 1}`}
                  >
                    <img
                      src={ph.thumbUrl || ph.url}
                      alt={ph.caption || ""}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <DeletePlaceButton placeId={fresh.id} placeName={fresh.name} onDeleted={onClose} />
        </div>
      </motion.div>
    </motion.div>

      {/* Лайтбокс — вне overlay, чтобы клики YARL не всплывали и не закрывали диалог */}
      {lightboxIdx !== null && (
        <PhotoLightbox
          open
          index={lightboxIdx}
          photos={photos}
          onIndexChange={setLightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onMapClick={(ph) => {
            // Фолбэк: у фото нет геометки — ведём к месту, где оно сделано
            const lat = ph.lat ?? fresh.lat;
            const lng = ph.lng ?? fresh.lng;
            if (lat != null && lng != null) {
              setMapFocusTarget({ lat, lng, placeId: fresh.id });
              setActiveTab("map");
              setLightboxIdx(null);
              onClose();
            } else {
              setLightboxIdx(null);
              toast.info("У этого фото нет геометки");
            }
          }}
          onDelete={deletePhoto}
          canDelete={(p) => isOwner || p.userId === currentUserId}
          pendingDelete={delPhoto.isPending}
          onToggleFavorite={togglePhotoFavorite}
          favoritePending={updPhoto.isPending}
          onSaveEdit={savePhotoEdit}
          canEdit={(p) => isOwner || p.userId === currentUserId}
        />
      )}
    </>
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
