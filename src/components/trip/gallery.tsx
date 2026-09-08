"use client";

import { usePhotos, useDeletePhoto, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Images, MapPin } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import type { Photo } from "@/lib/types";
import type { ReactNode } from "react";
import { PhotoLightbox } from "./photo-lightbox";
import { cn } from "@/lib/utils";

export function Gallery() {
  const tripId = useCurrentTripId();
  const { data: photos, isLoading, isError, refetch } = usePhotos();
  const { data: trip, isLoading: tripLoading, isError: tripError, refetch: refetchTrip } = useTrip();
  const del = useDeletePhoto();
  const { setTripSwitcherOpen } = useTripStore();
  const setActiveTab = useTripStore((s) => s.setActiveTab);
  const setMapFocusTarget = useTripStore((s) => s.setMapFocusTarget);
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const myRole = trip?.participants?.find((p) => p.id === currentUserId)?.role;
  const canDeleteAny = myRole === "owner";
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

  const handleDelete = (photoId: string) => {
    del.mutate(photoId, {
      onSuccess: () => {
        toast.success("Фото удалено");
        setLightbox(null);
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Не удалось удалить"),
    });
  };

  const onMapClick = (photo: Photo) => {
    if (photo.lat == null || photo.lng == null) return;
    setMapFocusTarget({ lat: photo.lat, lng: photo.lng, placeId: photo.placeId });
    setActiveTab("map");
    setLightbox(null);
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

      <div className="space-y-2">
        <div className="chip-rail no-scrollbar gap-1.5">
          <Chip active={filterCity === ""} onClick={() => { setFilterCity(""); setLightbox(null); }}>Все города</Chip>
          {[...new Set(trip?.days.map((d) => d.cityKey) ?? [])].map((c) => (
            <Chip
              key={c}
              active={filterCity === c}
              onClick={() => { setFilterCity(filterCity === c ? "" : c); setLightbox(null); }}
            >
              {trip?.days.find((d) => d.cityKey === c)?.city ?? c}
            </Chip>
          ))}
        </div>
        <div className="chip-rail no-scrollbar gap-1.5">
          <Chip active={filterDay === ""} onClick={() => { setFilterDay(""); setLightbox(null); }}>Все дни</Chip>
          {trip?.days.map((d) => (
            <Chip
              key={d.id}
              active={filterDay === String(d.dayNumber)}
              onClick={() => {
                setFilterDay(filterDay === String(d.dayNumber) ? "" : String(d.dayNumber));
                setLightbox(null);
              }}
            >
              День {d.dayNumber}
            </Chip>
          ))}
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setFilterDay("");
              setFilterCity("");
              setLightbox(null);
            }}
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setLightbox(i)}
                className="masonry-item relative rounded-xl overflow-hidden bg-muted block w-full cursor-pointer"
              >
                <img
                  src={photo.thumbUrl || photo.url}
                  alt={photo.caption || "Фото"}
                  className="w-full block bg-muted min-h-[120px] object-cover pointer-events-none"
                  loading="lazy"
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (photo.url && el.src !== photo.url && !el.src.endsWith(photo.url)) {
                      el.src = photo.url;
                      return;
                    }
                    el.style.visibility = "hidden";
                    const fallback = el.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.hidden = false;
                  }}
                />
                <div hidden className="w-full min-h-[120px] grid place-items-center text-muted-foreground text-xs p-4">
                  Не удалось показать фото
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2 flex flex-col gap-0.5 pointer-events-none">
                  <div className="text-white text-[10px] flex items-center gap-1">
                    <MapPin className="size-2.5" /> День {photo.day?.dayNumber}
                  </div>
                  {photo.caption && (
                    <div className="text-white text-xs line-clamp-1">{photo.caption}</div>
                  )}
                </div>
                {uploader && (
                  <div
                    className="absolute top-1.5 right-1.5 size-6 rounded-full grid place-items-center text-[10px] border border-white/50"
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

      <PhotoLightbox
        open={lightbox !== null}
        index={lightbox ?? 0}
        photos={filtered}
        onIndexChange={(i) => setLightbox(i)}
        onClose={() => setLightbox(null)}
        onMapClick={onMapClick}
        onDelete={handleDelete}
        canDelete={(p) => canDeleteAny || p.userId === currentUserId}
        pendingDelete={del.isPending}
      />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium min-h-11 active:scale-95 transition-transform whitespace-nowrap",
        active
          ? "bg-primary text-primary-foreground border border-primary"
          : "bg-card border border-border text-foreground",
      )}
    >
      {children}
    </button>
  );
}
