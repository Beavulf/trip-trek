"use client";

import { usePhotos, useDeletePhoto, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Images, X, Trash2, MapPin, Calendar, User } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";

export function Gallery() {
  const tripId = useCurrentTripId();
  const { data: photos, isLoading, isError, refetch } = usePhotos();
  const { data: trip, isLoading: tripLoading, isError: tripError, refetch: refetchTrip } = useTrip();
  const del = useDeletePhoto();
  const { setTripSwitcherOpen } = useTripStore();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const myRole = trip?.participants?.find((p) => p.id === currentUserId)?.role;
  const canDeleteAny = myRole === "owner";
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [filterDay, setFilterDay] = useState<string>("");
  const [filterCity, setFilterCity] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!photos) return [];
    return photos.filter((p) => {
      if (filterDay && p.day?.dayNumber !== parseInt(filterDay)) return false;
      if (filterCity && p.day?.cityKey !== filterCity) return false;
      return true;
    });
  }, [photos, filterDay, filterCity]);

  useEffect(() => {
    if (lightbox === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowLeft" && lightbox > 0) setLightbox(lightbox - 1);
      if (e.key === "ArrowRight" && lightbox < filtered.length - 1) setLightbox(lightbox + 1);
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [lightbox, filtered.length]);

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">📸</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Создай или выбери поездку</p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (tripError || isError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить галерею</p>
        <button
          type="button"
          onClick={() => { refetch(); refetchTrip(); }}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (isLoading || tripLoading) {
    return (
      <div className="space-y-3 animate-fade-up">
        <div className="flex items-center justify-between">
          <div className="h-6 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-12 bg-muted rounded animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-muted rounded-lg animate-pulse" />
          <div className="h-9 w-20 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="masonry-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="masonry-item rounded-xl overflow-hidden bg-muted" style={{ height: `${120 + (i % 3) * 60}px` }} />
          ))}
        </div>
      </div>
    );
  }

  const hasFilters = filterDay || filterCity;
  const totalPhotos = photos?.length ?? 0;
  const activePhoto = lightbox !== null ? filtered[lightbox] : null;
  const canDeleteActive =
    !!activePhoto && (canDeleteAny || activePhoto.userId === currentUserId);

  const handleDelete = (photoId: string) => {
    del.mutate(photoId, {
      onSuccess: () => {
        toast.success("Фото удалено");
        setLightbox(null);
        setConfirmDelete(null);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось удалить"),
    });
  };

  return (
    <div className="space-y-3 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <Images className="size-5" /> Галерея
        </h1>
        <span className="text-xs text-muted-foreground">
          {hasFilters ? `${filtered.length} из ${totalPhotos}` : `${totalPhotos}`} фото
        </span>
      </div>

      <div className="chip-rail no-scrollbar gap-2">
        <select
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          className="rounded-lg border border-input bg-card px-2 py-1.5 text-xs min-h-11"
        >
          <option value="">Все города</option>
          {[...new Set(trip?.days.map((d) => d.cityKey))].map((c) => (
            <option key={c} value={c}>{trip?.days.find((d) => d.cityKey === c)?.city}</option>
          ))}
        </select>
        <select
          value={filterDay}
          onChange={(e) => setFilterDay(e.target.value)}
          className="rounded-lg border border-input bg-card px-2 py-1.5 text-xs min-h-11"
        >
          <option value="">Все дни</option>
          {trip?.days.map((d) => (
            <option key={d.id} value={d.dayNumber}>День {d.dayNumber}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setFilterDay(""); setFilterCity(""); }}
            className="text-xs text-primary font-medium px-3 min-h-11 active:scale-95 transition-transform"
          >
            Сбросить
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-16 text-center bg-card/50">
          <motion.div
            animate={{ y: [0, -6, 0], rotate: [0, -3, 3, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="text-6xl mb-3 inline-block"
          >
            📸
          </motion.div>
          <p className="text-sm font-medium">{hasFilters ? "Нет фото по фильтру" : "Пока нет фото"}</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            {hasFilters
              ? "Попробуй сбросить фильтры"
              : "Запечатлейте моменты из поездки — нажмите кнопку + снизу"
            }
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setFilterDay(""); setFilterCity(""); }}
              className="mt-3 rounded-lg bg-secondary border border-border px-3 py-2 text-xs font-medium active:scale-95 min-h-11"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="masonry-grid">
          {filtered.map((photo, i) => {
            const uploader = photo.user;
            return (
              <motion.button
                key={photo.id}
                layoutId={`photo-${photo.id}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setLightbox(i)}
                className="masonry-item relative group rounded-xl overflow-hidden bg-muted block w-full"
              >
                <img
                  src={photo.thumbUrl || photo.url}
                  alt={photo.caption || "Фото"}
                  className="w-full block bg-muted min-h-[120px] object-cover"
                  loading="lazy"
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (photo.url && el.src !== photo.url && !el.src.endsWith(photo.url)) {
                      el.src = photo.url;
                      return;
                    }
                    el.style.display = "none";
                    const fallback = el.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.hidden = false;
                  }}
                />
                <div hidden className="w-full min-h-[120px] grid place-items-center text-muted-foreground text-xs p-4">
                  Не удалось показать фото
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex flex-col justify-end p-2">
                  <div className="text-white text-[10px] flex items-center gap-1">
                    <MapPin className="size-2.5" /> День {photo.day?.dayNumber}
                  </div>
                  {photo.caption && <div className="text-white text-xs mt-0.5 line-clamp-1">{photo.caption}</div>}
                </div>
                {uploader && (
                  <div
                    className="absolute top-1.5 right-1.5 size-5 rounded-full grid place-items-center text-[10px] border border-white/50"
                    style={{ background: uploader.color }}
                    title={uploader.name}
                  >
                    {uploader.emoji}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {lightbox !== null && activePhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4"
          >
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute top-4 right-4 size-11 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20 active:scale-90 transition-transform z-10"
            >
              <X className="size-5" />
            </button>

            {lightbox > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightbox(lightbox - 1); }}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20 active:scale-90 transition-transform text-2xl z-10"
              >
                ‹
              </button>
            )}
            {lightbox < filtered.length - 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightbox(lightbox + 1); }}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20 active:scale-90 transition-transform text-2xl z-10"
              >
                ›
              </button>
            )}

            <motion.div
              key={activePhoto.id}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-3xl w-full"
            >
              <img src={activePhoto.url} alt={activePhoto.caption || "Фото"} className="w-full max-h-[75vh] object-contain rounded-lg" />
              <div className="mt-3 flex items-center justify-between text-white/90 text-sm gap-2">
                <div className="space-y-1 min-w-0 flex-1">
                  {activePhoto.caption && <div className="font-medium">{activePhoto.caption}</div>}
                  <div className="flex items-center gap-3 text-xs text-white/70 flex-wrap">
                    <span className="flex items-center gap-1"><Calendar className="size-3" /> День {activePhoto.day?.dayNumber}</span>
                    <span className="flex items-center gap-1"><MapPin className="size-3" /> {activePhoto.day?.city}</span>
                    {activePhoto.user && (
                      <span className="flex items-center gap-1"><User className="size-3" /> {activePhoto.user?.name}</span>
                    )}
                  </div>
                  {activePhoto.address && (
                    <div className="flex items-start gap-1 text-xs text-cyan-300/90 mt-1">
                      <MapPin className="size-3 mt-0.5 shrink-0" />
                      <span>{activePhoto.address}</span>
                    </div>
                  )}
                </div>
                {canDeleteActive && (
                  confirmDelete === activePhoto.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDelete(activePhoto.id)}
                        disabled={del.isPending}
                        className="btn-confirm-yes"
                      >
                        {del.isPending ? "…" : "Удалить"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="btn-confirm-no bg-white/15 text-white"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(activePhoto.id)}
                      className="btn-icon-touch rounded-full bg-white/10 hover:bg-red-500/80 text-white shrink-0"
                      title="Удалить фото"
                      aria-label="Удалить фото"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
