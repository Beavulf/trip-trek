"use client";

import { usePhotos, useDeletePhoto, useUpdatePhoto, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { focusOnMap } from "@/lib/map-bus";
import { useAuth } from "@/hooks/use-auth";
import { motion, useReducedMotion } from "framer-motion";
import { Camera, Columns3, LayoutGrid, MapPin, Star } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import type { Photo } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { PhotoLightbox } from "./photo-lightbox";
import { MobileBottomSheet } from "./mobile-bottom-sheet";
import { PhotoForm } from "./quick-add/PhotoForm";

type Dimension = "day" | "city" | "person";
type LayoutMode = "masonry" | "compact";

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "day", label: "Дни" },
  { key: "city", label: "Города" },
  { key: "person", label: "Авторы" },
];

/** Плитка-«дырка» киноплёнки над и под лентой последних кадров */
function FilmHoles() {
  return (
    <div className="flex justify-between px-1" aria-hidden="true">
      {Array.from({ length: 16 }).map((_, i) => (
        <span key={i} className="size-1.5 rounded-[2px] bg-white/20 shrink-0" />
      ))}
    </div>
  );
}

export function Gallery() {
  const tripId = useCurrentTripId();
  const { data: photos, isLoading, isError, refetch } = usePhotos();
  const { data: trip, isLoading: tripLoading, isError: tripError, refetch: refetchTrip } = useTrip();
  const del = useDeletePhoto();
  const upd = useUpdatePhoto();
  const { setTripSwitcherOpen } = useTripStore();
  const setActiveTab = useTripStore((s) => s.setActiveTab);
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const myRole = trip?.participants?.find((p) => p.id === currentUserId)?.role;
  const isOwner = myRole === "owner";
  const reduceMotion = useReducedMotion();

  const [lightbox, setLightbox] = useState<number | null>(null);
  const [dimension, setDimension] = useState<Dimension>("day");
  const [chipValue, setChipValue] = useState<string>("");
  const [favOnly, setFavOnly] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>("masonry");
  const [addOpen, setAddOpen] = useState(false);

  const all = useMemo(() => (Array.isArray(photos) ? photos : []), [photos]);
  const total = all.length;

  const filtered = useMemo(
    () =>
      all.filter((p) => {
        if (favOnly && !p.isFavorite) return false;
        if (chipValue) {
          if (dimension === "day" && p.day?.dayNumber !== Number(chipValue)) return false;
          if (dimension === "city" && p.day?.cityKey !== chipValue) return false;
          if (dimension === "person" && p.userId !== chipValue) return false;
        }
        return true;
      }),
    [all, favOnly, chipValue, dimension],
  );

  // Счётчики для чипов активного измерения
  const options = useMemo(() => {
    if (dimension === "day") {
      const m = new Map<number, number>();
      all.forEach((p) => {
        if (p.day) m.set(p.day.dayNumber, (m.get(p.day.dayNumber) ?? 0) + 1);
      });
      return Array.from(m.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([n, count]) => ({ value: String(n), label: `День ${n}`, count }));
    }
    if (dimension === "city") {
      const m = new Map<string, { city: string; count: number }>();
      all.forEach((p) => {
        if (!p.day?.cityKey) return;
        const prev = m.get(p.day.cityKey);
        m.set(p.day.cityKey, { city: p.day.city, count: (prev?.count ?? 0) + 1 });
      });
      return Array.from(m.entries()).map(([key, v]) => ({ value: key, label: v.city, count: v.count }));
    }
    const m = new Map<string, { user: NonNullable<Photo["user"]>; count: number }>();
    all.forEach((p) => {
      if (!p.user) return;
      const prev = m.get(p.user.id);
      m.set(p.user.id, { user: p.user, count: (prev?.count ?? 0) + 1 });
    });
    return Array.from(m.entries()).map(([key, v]) => ({ value: key, label: `${v.user.emoji} ${v.user.name}`, count: v.count }));
  }, [all, dimension]);

  // Статистика альбома
  const stats = useMemo(() => {
    const cities = new Set<string>();
    const days = new Set<string>();
    const people = new Set<string>();
    const todayKey = new Date().toDateString();
    let today = 0;
    let fav = 0;
    all.forEach((p) => {
      if (p.day?.cityKey) cities.add(p.day.cityKey);
      if (p.dayId) days.add(p.dayId);
      if (p.userId) people.add(p.userId);
      if (new Date(p.takenAt).toDateString() === todayKey) today += 1;
      if (p.isFavorite) fav += 1;
    });
    return { cities: cities.size, days: days.size, people: people.size, today, fav };
  }, [all]);

  const strip = useMemo(() => filtered.slice(0, 12), [filtered]);
  const hasActiveFilters = favOnly || !!chipValue;

  const accent = useMemo(() => {
    if (!trip) return "#f97316";
    return trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.accentColor || "#f97316";
  }, [trip]);

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
          onClick={() => {
            refetch();
            refetchTrip();
          }}
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
        <div className="h-48 rounded-3xl bg-muted animate-pulse" />
        <div className="h-24 rounded-2xl bg-muted animate-pulse" />
        <div className="masonry-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="masonry-item rounded-xl overflow-hidden bg-muted" style={{ height: `${120 + (i % 3) * 60}px` }} />
          ))}
        </div>
      </div>
    );
  }

  const handleDelete = (photoId: string) => {
    del.mutate(photoId, {
      onSuccess: () => {
        toast.success("Фото удалено");
        setLightbox(null);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось удалить"),
    });
  };

  const toggleFavorite = (p: Photo) => {
    upd.mutate(
      { id: p.id, patch: { isFavorite: !p.isFavorite } },
      {
        onSuccess: () => toast.success(p.isFavorite ? "Убрано из избранного" : "В избранном ⭐"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось обновить"),
      },
    );
  };

  const saveEdit = async (photoId: string, patch: { caption?: string | null; dayId?: string }) => {
    try {
      await upd.mutateAsync({ id: photoId, patch });
      toast.success("Изменения сохранены");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
      return false;
    }
  };

  const onMapClick = (photo: Photo) => {
    let lat = photo.lat;
    let lng = photo.lng;
    // У фото нет своей геометки, но привязано место — летим к координатам места
    if ((lat == null || lng == null) && photo.placeId) {
      const place = trip?.days.flatMap((d) => d.places).find((p) => p.id === photo.placeId);
      if (place) {
        lat = place.lat;
        lng = place.lng;
      }
    }
    if (lat == null || lng == null) {
      toast.info("У этого фото нет геометки");
      return;
    }
    focusOnMap({ lat, lng, placeId: photo.placeId ?? undefined });
    setActiveTab("map");
    setLightbox(null);
  };

  // Плитка: фолбэк на оригинал, затем заглушка (thumb может отсутствовать/биться)
  const imgFallback = (e: React.SyntheticEvent<HTMLImageElement>, photo: Photo) => {
    const el = e.currentTarget;
    if (photo.url && el.src !== photo.url && !el.src.endsWith(photo.url)) {
      el.src = photo.url;
      return;
    }
    el.style.visibility = "hidden";
    const fallback = el.nextElementSibling as HTMLElement | null;
    if (fallback) fallback.hidden = false;
  };

  const heroTitle =
    total === 0
      ? "Плёнка пока пуста"
      : stats.today > 0
        ? `+${stats.today} ${plural(stats.today, "кадр", "кадра", "кадров")} сегодня`
        : `${total} ${plural(total, "кадр", "кадра", "кадров")}`;

  const statLine = [
    stats.cities > 0 ? `${stats.cities} ${plural(stats.cities, "город", "города", "городов")}` : null,
    stats.days > 0 ? `${stats.days} ${plural(stats.days, "день", "дня", "дней")} с фото` : null,
    stats.people > 0 ? `${stats.people} ${plural(stats.people, "автор", "автора", "авторов")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const imgFallbackHidden = (p: Photo, aspect: string) => (
    <div hidden className={cn("w-full place-items-center text-muted-foreground text-xs p-2", aspect)}>
      Не удалось показать фото
    </div>
  );

  return (
    <div className="space-y-3 animate-fade-up pb-20">
      {/* === Hero: тёмная «плёнка» с перфорацией и лентой последних кадров === */}
      <section
        className="rounded-3xl p-5 text-white shadow-xl relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${accent} 0%, #1c1917 100%)` }}
      >
        <div className="absolute -bottom-10 -right-6 size-36 rounded-full opacity-10 blur-2xl bg-white" aria-hidden="true" />
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-xs mb-2">
            <Camera className="size-3.5" />
            <span>Фотоальбом поездки</span>
            {stats.today > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5">
                {!reduceMotion && (
                  <span className="relative flex size-2" aria-hidden="true">
                    <span className="absolute inline-flex size-full rounded-full bg-emerald-300 opacity-75 animate-ping" />
                  </span>
                )}
                <span className="size-2 rounded-full bg-emerald-300" aria-hidden="true" />
                {stats.today} сегодня
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold leading-tight">{heroTitle}</h1>
          {statLine && total > 0 && <p className="text-xs text-white/70 mt-1">{statLine}</p>}

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white text-stone-900 px-4 min-h-11 text-sm font-semibold active:scale-95 transition-transform shadow focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <Camera className="size-4" /> Добавить фото
          </button>

          {/* Киноплёнка: перфорация + недавние кадры; тап — лайтбокс */}
          {strip.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] text-white/70 mb-1.5 flex items-center gap-1.5">
                <Star className="size-3 fill-white/50 text-white/50" aria-hidden="true" />
                Недавние кадры
              </div>
              <div className="rounded-xl bg-black/30 p-1.5">
                <FilmHoles />
                <div className="chip-rail no-scrollbar gap-1.5 py-1.5">
                  {strip.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setLightbox(i)}
                      className="relative h-14 w-20 shrink-0 rounded-md overflow-hidden ring-1 ring-white/25 active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-white/70"
                      aria-label={p.caption || `Фото ${i + 1}`}
                    >
                      <img src={p.thumbUrl || p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      {p.isFavorite && (
                        <Star className="absolute top-0.5 left-0.5 size-3 fill-yellow-300 text-yellow-300 drop-shadow" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
                <FilmHoles />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* === Липкий фильтр-бар: измерение + избранное + режим сетки + чипы === */}
      <div className="sticky sticky-under-shell z-20 glass-strong rounded-2xl border border-border p-2 space-y-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex-1 grid grid-cols-3 gap-0.5 rounded-xl bg-muted p-0.5" role="group" aria-label="Размер фильтра">
            {DIMENSIONS.map((d) => {
              const active = dimension === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setDimension(d.key);
                    setChipValue("");
                  }}
                  className={cn(
                    "min-h-11 rounded-lg text-xs font-medium transition-all active:scale-95",
                    active ? "bg-card shadow text-foreground font-semibold" : "text-muted-foreground",
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-pressed={favOnly}
            aria-label="Только избранные фото"
            title="Только избранное"
            onClick={() => setFavOnly((v) => !v)}
            className={cn(
              "size-11 shrink-0 rounded-xl border grid place-items-center active:scale-95 transition-all",
              favOnly ? "bg-amber-400/15 border-amber-400/50 text-amber-500" : "bg-card border-border text-muted-foreground",
            )}
          >
            <Star className={cn("size-4", favOnly && "fill-amber-400")} />
          </button>
          <button
            type="button"
            aria-pressed={layout === "compact"}
            aria-label={layout === "masonry" ? "Компактная сетка" : "Плитки"}
            title={layout === "masonry" ? "Компактная сетка" : "Плитки"}
            onClick={() => setLayout((v) => (v === "masonry" ? "compact" : "masonry"))}
            className="size-11 shrink-0 rounded-xl border border-border bg-card text-muted-foreground grid place-items-center active:scale-95 transition-transform"
          >
            {layout === "masonry" ? <Columns3 className="size-4" /> : <LayoutGrid className="size-4" />}
          </button>
        </div>

        <div className="chip-rail no-scrollbar gap-1.5">
          <Chip
            active={!chipValue}
            onClick={() => {
              setChipValue("");
              setLightbox(null);
            }}
          >
            Все
          </Chip>
          {options.map((o) => (
            <Chip
              key={o.value}
              active={chipValue === o.value}
              onClick={() => {
                setChipValue(chipValue === o.value ? "" : o.value);
                setLightbox(null);
              }}
            >
              {o.label}
              <span className="ml-1 tabular-nums opacity-60">{o.count}</span>
            </Chip>
          ))}
        </div>
      </div>

      {/* Строка результата при активных фильтрах */}
      {hasActiveFilters && filtered.length > 0 && (
        <div className="flex items-center justify-between px-1 -my-1">
          <span className="text-xs text-muted-foreground">
            {filtered.length} из {total}
          </span>
          <button
            type="button"
            onClick={() => {
              setChipValue("");
              setFavOnly(false);
            }}
            className="text-xs text-primary font-medium px-2 py-2 active:scale-95 transition-transform"
          >
            Сбросить
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-14 px-4 text-center bg-card/50">
          <motion.div
            animate={reduceMotion ? {} : { y: [0, -6, 0], rotate: [0, -3, 3, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="text-6xl mb-3 inline-block"
          >
            📸
          </motion.div>
          {total === 0 ? (
            <>
              <p className="text-sm font-semibold">Пока нет фото</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Запечатлейте первый момент поездки — снимок сразу появится в альбоме и хронике
              </p>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 min-h-11 text-sm font-medium active:scale-95 transition-transform"
              >
                <Camera className="size-4" /> Добавить фото
              </button>
            </>
          ) : favOnly && stats.fav === 0 ? (
            <>
              <p className="text-sm font-semibold">Избранных пока нет</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Откройте любое фото и нажмите ☆ — лучшие кадры соберутся здесь
              </p>
              <button
                type="button"
                onClick={() => setFavOnly(false)}
                className="mt-4 rounded-lg bg-secondary border border-border px-3 py-2 text-xs font-medium active:scale-95 min-h-11"
              >
                Показать все фото
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Ничего не найдено</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                В этой подборке пусто — попробуйте другой фильтр
              </p>
              <button
                type="button"
                onClick={() => {
                  setChipValue("");
                  setFavOnly(false);
                }}
                className="mt-4 rounded-lg bg-secondary border border-border px-3 py-2 text-xs font-medium active:scale-95 min-h-11"
              >
                Сбросить фильтры
              </button>
            </>
          )}
        </div>
      ) : layout === "masonry" ? (
        <div className="masonry-grid">
          {filtered.map((photo, i) => (
            <motion.button
              key={photo.id}
              type="button"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setLightbox(i)}
              className="masonry-item relative rounded-xl overflow-hidden bg-muted block w-full cursor-pointer active:scale-[0.98] transition-transform"
            >
              <img
                src={photo.thumbUrl || photo.url}
                alt={photo.caption || "Фото"}
                className="w-full block bg-muted min-h-[120px] object-cover pointer-events-none"
                loading="lazy"
                onError={(e) => imgFallback(e, photo)}
              />
              {imgFallbackHidden(photo, "min-h-[120px] grid")}
              {photo.isFavorite && (
                <span className="absolute top-1.5 left-1.5 size-6 rounded-full bg-black/50 grid place-items-center">
                  <Star className="size-3.5 fill-yellow-300 text-yellow-300" aria-hidden="true" />
                </span>
              )}
              {photo.user && (
                <span
                  className="absolute top-1.5 right-1.5 size-6 rounded-full grid place-items-center text-[10px] border border-white/50"
                  style={{ background: photo.user.color }}
                  title={photo.user.name}
                >
                  {photo.user.emoji}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2 flex flex-col gap-0.5 pointer-events-none text-left">
                <span className="text-white/85 text-[10px] flex items-center gap-1 font-mono tracking-wide">
                  <MapPin className="size-2.5" aria-hidden="true" />
                  День {photo.day?.dayNumber}
                  {photo.day?.city ? ` · ${photo.day.city}` : ""}
                </span>
                {photo.caption && <span className="text-white text-xs line-clamp-1">{photo.caption}</span>}
              </span>
            </motion.button>
          ))}
        </div>
      ) : (
        /* Компактный режим: контактный лист 3×N — быстро просмотреть много кадров */
        <div className="grid grid-cols-3 gap-0.5">
          {filtered.map((photo, i) => (
            <motion.button
              key={photo.id}
              type="button"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setLightbox(i)}
              className="relative aspect-square overflow-hidden bg-muted active:scale-[0.97] transition-transform"
              aria-label={photo.caption || "Фото"}
            >
              <img
                src={photo.thumbUrl || photo.url}
                alt={photo.caption || "Фото"}
                className="w-full h-full object-cover pointer-events-none"
                loading="lazy"
                onError={(e) => imgFallback(e, photo)}
              />
              {imgFallbackHidden(photo, "absolute inset-0 grid")}
              {photo.isFavorite && (
                <Star className="absolute top-1 left-1 size-3.5 fill-yellow-300 text-yellow-300 drop-shadow" aria-hidden="true" />
              )}
            </motion.button>
          ))}
        </div>
      )}

      {/* Шторка добавления фото — прямо из галереи */}
      <MobileBottomSheet open={addOpen} onOpenChange={setAddOpen} title="Добавить фото" titleIcon={<Camera className="size-4" />}>
        <PhotoForm onDone={() => setAddOpen(false)} />
      </MobileBottomSheet>

      <PhotoLightbox
        open={lightbox !== null}
        index={lightbox ?? 0}
        photos={filtered}
        onIndexChange={(i) => setLightbox(i)}
        onClose={() => setLightbox(null)}
        onMapClick={onMapClick}
        onDelete={handleDelete}
        canDelete={(p) => isOwner || p.userId === currentUserId}
        canEdit={(p) => isOwner || p.userId === currentUserId}
        pendingDelete={del.isPending}
        onToggleFavorite={toggleFavorite}
        favoritePending={upd.isPending}
        onSaveEdit={saveEdit}
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
