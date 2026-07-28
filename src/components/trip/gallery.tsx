"use client";

import { usePhotos, useDeletePhoto, useTrip } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import { Images, X, Trash2, MapPin, Calendar, User, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function Gallery() {
  const { data: photos, isLoading } = usePhotos();
  const { data: trip } = useTrip();
  const del = useDeletePhoto();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [filterDay, setFilterDay] = useState<string>("");
  const [filterCity, setFilterCity] = useState<string>("");

  const filtered = useMemo(() => {
    if (!photos) return [];
    return photos.filter((p) => {
      if (filterDay && p.day?.dayNumber !== parseInt(filterDay)) return false;
      if (filterCity && p.day?.cityKey !== filterCity) return false;
      return true;
    });
  }, [photos, filterDay, filterCity]);

  if (isLoading) {
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

  return (
    <div className="space-y-3 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <Images className="size-5" /> Галерея
        </h1>
        <span className="text-xs text-muted-foreground">{filtered.length} фото</span>
      </div>

      {/* Фильтры */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <select
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          className="rounded-lg border border-input bg-card px-2 py-1.5 text-xs"
        >
          <option value="">Все города</option>
          {[...new Set(trip?.days.map((d) => d.cityKey))].map((c) => (
            <option key={c} value={c}>{trip?.days.find((d) => d.cityKey === c)?.city}</option>
          ))}
        </select>
        <select
          value={filterDay}
          onChange={(e) => setFilterDay(e.target.value)}
          className="rounded-lg border border-input bg-card px-2 py-1.5 text-xs"
        >
          <option value="">Все дни</option>
          {trip?.days.map((d) => (
            <option key={d.id} value={d.dayNumber}>День {d.dayNumber}</option>
          ))}
        </select>
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
          <p className="text-sm font-medium">Пока нет фото</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Запечатлейте моменты из поездки — нажмите кнопку <span className="inline-flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold align-middle mx-0.5">+</span> снизу
          </p>
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
                <img src={photo.url} alt={photo.caption || ""} className="w-full block" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                  <div className="text-white text-[10px] flex items-center gap-1">
                    <MapPin className="size-2.5" /> День {photo.day?.dayNumber} · {photo.day?.city}
                  </div>
                  {photo.caption && <div className="text-white text-xs mt-0.5 line-clamp-1">{photo.caption}</div>}
                </div>
                {uploader && (
                  <div
                    className="absolute top-1.5 right-1.5 size-5 rounded-full grid place-items-center text-[10px] border border-white/50"
                    style={{ background: uploader.color }}
                  >
                    {uploader.emoji}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox !== null && filtered[lightbox] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4"
          >
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-4 right-4 size-10 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20"
            >
              <X className="size-5" />
            </button>

            {/* Навигация */}
            {lightbox > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox(lightbox - 1); }}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20"
              >
                ‹
              </button>
            )}
            {lightbox < filtered.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox(lightbox + 1); }}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20"
              >
                ›
              </button>
            )}

            <motion.div
              key={filtered[lightbox].id}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-3xl w-full"
            >
              <img src={filtered[lightbox].url} alt="" className="w-full max-h-[75vh] object-contain rounded-lg" />
              <div className="mt-3 flex items-center justify-between text-white/90 text-sm">
                <div className="space-y-1">
                  {filtered[lightbox].caption && <div className="font-medium">{filtered[lightbox].caption}</div>}
                  <div className="flex items-center gap-3 text-xs text-white/70 flex-wrap">
                    <span className="flex items-center gap-1"><Calendar className="size-3" /> День {filtered[lightbox].day?.dayNumber}</span>
                    <span className="flex items-center gap-1"><MapPin className="size-3" /> {filtered[lightbox].day?.city}</span>
                    {filtered[lightbox].user && (
                      <span className="flex items-center gap-1"><User className="size-3" /> {filtered[lightbox].user?.name}</span>
                    )}
                  </div>
                  {filtered[lightbox].address && (
                    <div className="flex items-start gap-1 text-xs text-cyan-300/90 mt-1">
                      <MapPin className="size-3 mt-0.5 shrink-0" />
                      <span>{filtered[lightbox].address}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    del.mutate(filtered[lightbox].id);
                    setLightbox(null);
                    toast.success("Фото удалено");
                  }}
                  className="size-9 rounded-full bg-white/10 hover:bg-red-500/80 grid place-items-center"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
