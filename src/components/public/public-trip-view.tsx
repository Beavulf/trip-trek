"use client";

// «Живой журнал» — публичная страница поездки (гостям, без входа).
// Порядок чтения: обложка → лучшие кадры → главы-дни (текст + фото + места)
// → все фото (masonry) → карта. Три действия гостя: лайк-сердечко,
// скачивание ZIP всех фото, полноэкранный просмотр с подписями (YARL).
// Дизайн-контракт: одна колонка max-w-2xl, акцент поездки тонирует обложку
// и чипсы, motion — мягкие fade-up при входе в вьюпорт (уважая reduced motion).

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion, type MotionProps } from "framer-motion";
import { Camera, Download, Heart, MapPin, Star } from "lucide-react";
import { toast } from "sonner";
import { Lightbox } from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
// Стили YARL обязательны: без styles.css лайтбокс рисуется в потоке страницы
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
import { cn } from "@/lib/utils";

// Листлет тянет осязаемый CSS/JS — на публичную страницу только по требованию
const PublicMap = dynamic(() => import("./public-map").then((m) => m.PublicMap), {
  ssr: false,
  loading: () => <div className="w-full h-[320px] rounded-2xl bg-muted animate-pulse" />,
});

export interface PublicPhoto {
  url: string;
  thumbUrl: string;
  caption: string | null;
  isFavorite: boolean;
  lat: number | null;
  lng: number | null;
  takenAt: string;
  placeName: string | null;
  dayNumber: number | null;
}

export interface PublicTrip {
  title: string;
  destination: string;
  emoji: string;
  accent: string;
  startDate: string;
  endDate: string | null;
  totalDays: number;
  allowDownload: boolean;
  hearts: number;
  days: {
    dayNumber: number;
    date: string;
    city: string;
    title: string;
    summary: string | null;
    places: { name: string; category: string; lat: number; lng: number; visited: boolean }[];
  }[];
  photos: PublicPhoto[];
}

/** Русские множественные формы: plural(3, ["город","города","городов"]) */
const plural = (n: number, forms: [string, string, string]) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
};

const fmtShort = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "") : "";

const fmtLong = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";

const photoFileName = (p: PublicPhoto) => {
  const base = (p.caption || `day-${p.dayNumber ?? "x"}`).replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60);
  const ext = /\.(jpe?g|png|webp)$/i.exec(p.url)?.[1]?.toLowerCase() ?? "jpg";
  return `triptrek-${base}.${ext}`;
};

interface ViewerState {
  list: PublicPhoto[];
  index: number;
}

export function PublicTripView({ trip, token }: { trip: PublicTrip; token: string }) {
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [showFloatingBar, setShowFloatingBar] = useState(false);
  // reduced motion выясняем после монтирования: разница сервер/клиент сломала бы гидрацию
  const [reducedMotion, setReducedMotion] = useState(false);

  // Сердечко: анонимный лайк страницы, один тап с устройства (localStorage)
  const [hearts, setHearts] = useState(trip.hearts);
  const [liked, setLiked] = useState(false);
  const [likePending, setLikePending] = useState(false);

  const likeKey = `triptrek:share-like:${token}`;

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    try {
      if (localStorage.getItem(likeKey) === "1") setLiked(true);
    } catch {
      // приватный режим без localStorage — сердечко просто не помнится
    }
  }, [likeKey]);

  // «назад» на телефоне закрывает просмотр фото, а не сворачивает страницу
  useBackDismiss(!!viewer, () => setViewer(null));

  const cities = useMemo(() => {
    const seen: string[] = [];
    for (const d of trip.days) if (!seen.includes(d.city)) seen.push(d.city);
    return seen;
  }, [trip.days]);

  const allPlaces = useMemo(() => trip.days.flatMap((d) => d.places), [trip.days]);
  const visitedCount = allPlaces.filter((p) => p.visited).length;
  const favorites = useMemo(() => trip.photos.filter((p) => p.isFavorite), [trip.photos]);
  const photosByDay = useMemo(() => {
    const map = new Map<number, PublicPhoto[]>();
    for (const p of trip.photos) {
      if (p.dayNumber == null) continue;
      const list = map.get(p.dayNumber) ?? [];
      list.push(p);
      map.set(p.dayNumber, list);
    }
    return map;
  }, [trip.photos]);
  const photoPoints = useMemo(
    () => trip.photos.filter((p) => p.lat != null && p.lng != null).map((p) => ({ lat: p.lat!, lng: p.lng! })),
    [trip.photos]
  );

  const dateLabel =
    trip.endDate && trip.endDate !== trip.startDate
      ? `${fmtShort(trip.startDate)} — ${fmtShort(trip.endDate)}`
      : fmtShort(trip.startDate) || "скоро в путь";

  const zipUrl = `/p/${token}/photos.zip`;
  const canDownloadZip = trip.allowDownload && trip.photos.length > 0;

  const like = async () => {
    if (liked || likePending) return;
    setLikePending(true);
    setLiked(true);
    setHearts((h) => h + 1);
    try {
      localStorage.setItem(likeKey, "1");
    } catch {
      /* не критично */
    }
    try {
      const r = await fetch(`/p/${token}/heart`, { method: "POST" });
      if (!r.ok) throw new Error("failed");
      const d = (await r.json()) as { hearts: number };
      setHearts(d.hearts);
    } catch {
      // откат — тихо, кнопка снова активна
      setLiked(false);
      setHearts((h) => Math.max(trip.hearts, h - 1));
      try {
        localStorage.removeItem(likeKey);
      } catch {
        /* не критично */
      }
    } finally {
      setLikePending(false);
    }
  };

  // Scroll-spy глав: подсветка чипса текущего дня в липкой навигации
  useEffect(() => {
    if (trip.days.length === 0) return;
    const els = trip.days
      .map((d) => document.getElementById(`day-${d.dayNumber}`))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveDay(Number(entry.target.id.replace("day-", "")));
        }
      },
      { rootMargin: "-25% 0px -65% 0px" }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [trip.days]);

  // Плавающая панель действий — после пролистывания обложки
  useEffect(() => {
    const onScroll = () => setShowFloatingBar(window.scrollY > 560);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const jumpToDay = (dayNumber: number) => {
    document.getElementById(`day-${dayNumber}`)?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  /** Пропсы плавного появления; при reduced motion — без анимации */
  const reveal = (delay = 0): MotionProps =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-40px" },
          transition: { duration: 0.5, delay, ease: "easeOut" },
        };

  const viewerPhoto = viewer ? viewer.list[viewer.index] : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ═══ Обложка ═══ */}
      <header className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(130% 90% at 50% 0%, ${trip.accent}2e, transparent 62%)` }}
          aria-hidden
        />
        <div className="relative max-w-2xl mx-auto px-4 pt-8 pb-9 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
          >
            🧭 TRIPTREK
          </a>
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, scale: 0.8 }}
            animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-6xl mt-6 select-none"
            style={{ filter: `drop-shadow(0 10px 24px ${trip.accent}55)` }}
            aria-hidden
          >
            {trip.emoji}
          </motion.div>
          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-balance">{trip.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {dateLabel} · {trip.totalDays} {plural(trip.totalDays, ["день", "дня", "дней"])}
          </p>
          {cities.length > 0 && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{cities.join(" → ")}</p>}

          {/* Счётчики поездки */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <StatChip>{visitedCount} из {allPlaces.length} мест</StatChip>
            {cities.length > 0 && (
              <StatChip>
                {cities.length} {plural(cities.length, ["город", "города", "городов"])}
              </StatChip>
            )}
            {trip.photos.length > 0 && (
              <StatChip>
                {trip.photos.length} {plural(trip.photos.length, ["фото", "фото", "фото"])}
              </StatChip>
            )}
          </div>

          {/* Действия гостя */}
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {canDownloadZip && (
                <a
                  href={zipUrl}
                  download
                  className="min-h-11 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 text-sm font-semibold shadow-lg active:scale-95 transition-transform"
                  style={{ boxShadow: `0 8px 24px ${trip.accent}44` }}
                >
                  <Download className="size-4" /> Скачать все фото
                </a>
              )}
              <button
                type="button"
                onClick={like}
                disabled={liked || likePending}
                aria-label={liked ? "Вы уже оставили сердечко" : "Оставить сердечко"}
                className={cn(
                  "min-h-11 inline-flex items-center gap-2 rounded-full px-5 text-sm font-semibold border transition-all active:scale-95",
                  liked
                    ? "border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : "border-border bg-card hover:bg-accent"
                )}
              >
                <motion.span
                  key={`${liked}-${hearts}`}
                  initial={reducedMotion || !liked ? undefined : { scale: 0.4 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                  className="grid place-items-center"
                >
                  <Heart className={cn("size-4", liked && "fill-rose-500 text-rose-500")} />
                </motion.span>
                {hearts}
              </button>
          </div>
        </div>
      </header>

      {/* ═══ Лучшие кадры ═══ */}
      {favorites.length > 0 && (
        <section className="pb-2">
          <div className="max-w-2xl mx-auto px-4">
            <SectionTitle icon={<Star className="size-3.5 fill-current" />}>Лучшие кадры</SectionTitle>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory px-4 pb-3 pt-1 -mx-0">
            {favorites.map((p, i) => (
              <motion.button
                key={p.url + i}
                type="button"
                onClick={() => setViewer({ list: favorites, index: i })}
                className="relative shrink-0 snap-start w-40 sm:w-48 aspect-[3/4] rounded-2xl overflow-hidden bg-muted text-left active:scale-[0.97] transition-transform"
                {...(reducedMotion ? {} : reveal(Math.min(i * 0.05, 0.3)))}
                aria-label={p.caption ?? "Лучшее фото поездки"}
              >
                <img
                  src={p.thumbUrl}
                  alt={p.caption ?? ""}
                  loading={i < 2 ? "eager" : "lazy"}
                  decoding="async"
                  className="size-full object-cover"
                />
                <span
                  className="absolute top-2 right-2 grid place-items-center size-6 rounded-full bg-black/40 text-amber-300 backdrop-blur-sm"
                  aria-hidden
                >
                  <Star className="size-3 fill-current" />
                </span>
                {p.caption && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent text-white text-[11px] leading-snug p-2.5 pt-6 line-clamp-2">
                    {p.caption}
                  </span>
                )}
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {/* ═══ Липкая навигация по дням ═══ */}
      {trip.days.length > 1 && (
        <nav
          className="sticky top-0 z-30 border-y border-border/60 bg-background/85 backdrop-blur-md"
          aria-label="Дни поездки"
        >
          <div className="max-w-2xl mx-auto px-4 flex gap-1.5 overflow-x-auto no-scrollbar py-2">
            {trip.days.map((d) => (
              <button
                key={d.dayNumber}
                type="button"
                onClick={() => jumpToDay(d.dayNumber)}
                aria-current={activeDay === d.dayNumber}
                className={cn(
                  "shrink-0 min-h-8 px-2.5 rounded-full text-xs font-semibold tabular-nums transition-colors",
                  activeDay === d.dayNumber
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground bg-muted/60"
                )}
                style={activeDay === d.dayNumber ? { background: trip.accent } : undefined}
              >
                Д{d.dayNumber}
                <span className="hidden sm:inline font-normal opacity-75"> · {d.city}</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* ═══ Главы-дни ═══ */}
      {trip.days.length > 0 && (
        <div className="max-w-2xl mx-auto px-4 divide-y divide-border/60">
          {trip.days.map((d) => {
            const dayPhotos = photosByDay.get(d.dayNumber) ?? [];
            const shown = dayPhotos.slice(0, 6);
            const hiddenCount = dayPhotos.length - shown.length;
            return (
              <Reveal key={d.dayNumber} disabled={reducedMotion} className="py-7 scroll-mt-16" id={`day-${d.dayNumber}`}>
                <div className="flex items-center gap-2.5">
                  <span
                    className="text-[11px] font-bold tabular-nums rounded-lg px-2 py-1"
                    style={{ background: `${trip.accent}22`, color: trip.accent }}
                  >
                    Д{d.dayNumber}
                  </span>
                  <span className="text-sm font-semibold">{d.city}</span>
                  <span className="text-xs text-muted-foreground">{fmtLong(d.date)}</span>
                </div>
                {d.title && <h3 className="mt-2 text-lg font-bold leading-snug text-balance">{d.title}</h3>}
                {d.summary && <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{d.summary}</p>}

                {dayPhotos.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-1.5">
                    {shown.map((p, i) => (
                      <button
                        key={p.url + i}
                        type="button"
                        onClick={() => setViewer({ list: dayPhotos, index: i })}
                        className="relative aspect-square rounded-xl overflow-hidden bg-muted active:scale-[0.97] transition-transform"
                        aria-label={p.caption ?? `Фото, день ${d.dayNumber}`}
                      >
                        <img
                          src={p.thumbUrl}
                          alt={p.caption ?? ""}
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover"
                        />
                        {p.isFavorite && (
                          <span className="absolute top-1.5 right-1.5 grid place-items-center size-5 rounded-full bg-black/40 text-amber-300 backdrop-blur-sm" aria-hidden>
                            <Star className="size-2.5 fill-current" />
                          </span>
                        )}
                        {i === shown.length - 1 && hiddenCount > 0 && (
                          <span className="absolute inset-0 grid place-items-center bg-black/55 text-white text-sm font-bold backdrop-blur-[2px]">
                            +{hiddenCount}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {d.places.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {d.places.map((p, i) => (
                      <span
                        key={`${p.name}-${i}`}
                        className={
                          p.visited
                            ? "text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground"
                        }
                      >
                        {p.visited ? "✓ " : ""}
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </Reveal>
            );
          })}
        </div>
      )}

      {/* ═══ Все фото ═══ */}
      {trip.photos.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 py-7 border-t border-border/60">
          <SectionTitle icon={<Camera className="size-3.5" />}>
            Все фото · {trip.photos.length}
          </SectionTitle>
          <div className="columns-2 sm:columns-3 gap-2 [&>*]:mb-2">
            {trip.photos.map((p, i) => (
              <Reveal key={p.url + i} disabled={reducedMotion} delay={Math.min((i % 6) * 0.04, 0.2)} className="break-inside-avoid">
                <button
                  type="button"
                  onClick={() => setViewer({ list: trip.photos, index: i })}
                  className="relative w-full rounded-xl overflow-hidden bg-muted active:scale-[0.98] transition-transform block"
                  aria-label={p.caption ?? "Фото поездки"}
                >
                  <img
                    src={p.thumbUrl}
                    alt={p.caption ?? ""}
                    loading="lazy"
                    decoding="async"
                    className="w-full object-cover"
                  />
                  {p.isFavorite && (
                    <span
                      className="absolute top-2 right-2 grid place-items-center size-6 rounded-full bg-black/40 text-amber-300 backdrop-blur-sm"
                      aria-hidden
                    >
                      <Star className="size-3 fill-current" />
                    </span>
                  )}
                  {p.caption && (
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent text-white text-[11px] leading-snug text-left p-2 pt-6 line-clamp-2">
                      {p.caption}
                    </span>
                  )}
                </button>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ═══ Карта ═══ */}
      {allPlaces.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 py-7 border-t border-border/60">
          <SectionTitle icon={<MapPin className="size-3.5" />}>Карта путешествия</SectionTitle>
          <PublicMap places={allPlaces} photoPoints={photoPoints} />
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-emerald-500" aria-hidden /> посещённые места
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2 rounded-full" style={{ background: trip.accent }} aria-hidden /> в плане
            </span>
            {photoPoints.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Camera className="size-3" /> где сделаны фото
              </span>
            )}
          </div>
        </section>
      )}

      {/* ═══ Футер ═══ */}
      <footer className="border-t border-border/60 mt-2">
        <div className="max-w-2xl mx-auto px-4 py-8 text-center space-y-1.5">
          <p className="text-sm">
            Путешествие живёт в <b>TripTrek</b>
          </p>
          <a
            href="/"
            className="inline-block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Спланировать свою поездку →
          </a>
        </div>
      </footer>

      {/* ═══ Плавающая панель действий (после обложки) ═══ */}
      <motion.div
          initial={false}
          animate={{ y: showFloatingBar ? 0 : 80, opacity: showFloatingBar ? 1 : 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed inset-x-0 bottom-[calc(0.9rem+env(safe-area-inset-bottom))] z-40 flex justify-center pointer-events-none sm:hidden"
          aria-hidden={!showFloatingBar}
        >
          <div
            className={cn(
              "pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-card/95 backdrop-blur shadow-xl p-1.5",
              !showFloatingBar && "pointer-events-none"
            )}
          >
            {canDownloadZip && (
              <a
                href={zipUrl}
                download
                tabIndex={showFloatingBar ? 0 : -1}
                className="min-h-10 inline-flex items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white active:scale-95 transition-transform"
                style={{ background: trip.accent }}
              >
                <Download className="size-3.5" /> Все фото
              </a>
            )}
            <button
              type="button"
              onClick={like}
              disabled={liked || likePending}
              tabIndex={showFloatingBar ? 0 : -1}
              className={cn(
                "min-h-10 inline-flex items-center gap-1.5 rounded-full px-4 text-xs font-semibold border transition-transform active:scale-95",
                liked ? "border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-400" : "border-border bg-background"
              )}
            >
              <Heart className={cn("size-3.5", liked && "fill-rose-500 text-rose-500")} /> {hearts}
            </button>
          </div>
      </motion.div>

      {/* ═══ Полноэкранный просмотр фото ═══ */}
      {viewerPhoto && (
        <Lightbox
          open
          close={() => setViewer(null)}
          index={viewer!.index}
          on={{ view: ({ index: i }) => setViewer((v) => (v ? { ...v, index: i } : v)) }}
          slides={viewer!.list.map((p) => ({
            src: p.url,
            alt: p.caption ?? "Фото поездки",
            title: p.caption ?? undefined,
            description: (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs opacity-85">
                {p.dayNumber != null && <span>День {p.dayNumber}</span>}
                {p.placeName && <span>📍 {p.placeName}</span>}
                {p.takenAt && <span className="opacity-70">{fmtLong(p.takenAt)}</span>}
              </div>
            ),
          }))}
          plugins={[Captions, Counter, Zoom]}
          carousel={{ finite: false, preload: 1 }}
          controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
          captions={{ showToggle: false }}
          zoom={{ scrollToZoom: true, pinchZoomV4: true }}
          toolbar={{
            buttons: [
              <button
                key="download"
                type="button"
                aria-label="Скачать фото"
                title="Скачать фото"
                onClick={(e) => {
                  e.stopPropagation();
                  const a = document.createElement("a");
                  a.href = viewerPhoto.url;
                  a.download = photoFileName(viewerPhoto);
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  toast.success("Фото скачивается");
                }}
                className="size-11 rounded-full grid place-items-center text-white bg-white/10 hover:bg-white/20 active:scale-90 transition-transform"
              >
                <Download className="size-5" />
              </button>,
            ],
          }}
        />
      )}
    </main>
  );
}

/* ── Мелкие строительные блоки ── */

function StatChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
      {icon} {children}
    </h2>
  );
}

/** Плавное появление секции при входе в вьюпорт; disabled — при reduced motion */
function Reveal({
  disabled,
  delay = 0,
  className,
  id,
  children,
}: {
  disabled: boolean;
  delay?: number;
  className?: string;
  id?: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <section id={id} className={className}>
        {children}
      </section>
    );
  }
  return (
    <motion.section
      id={id}
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.section>
  );
}
