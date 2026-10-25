"use client";

// «Живой журнал» — публичная страница поездки (гостям, без входа).
// Порядок чтения: обложка → «продолжить с места» → лучшие кадры → главы-дни
// (текст + фото + места) → все фото по дням (masonry) → карта. Фото везде идут по ходу
// поездки: день за днём, внутри дня от раннего кадра к позднему (порядок задаёт сервер). Три действия гостя: лайк-сердечко,
// скачивание ZIP всех фото, полноэкранный просмотр с подписями (YARL).
// Дизайн-контракт: одна колонка max-w-2xl, акцент поездки тонирует обложку
// и чипсы, motion — мягкие fade-up при входе в вьюпорт (уважая reduced motion).

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, type MotionProps } from "framer-motion";
import { Camera, ChevronsLeft, ChevronsRight, Download, Heart, History, Images, MapPin, Play, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Lightbox } from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
// Стили YARL обязательны: без styles.css лайтбокс рисуется в потоке страницы
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
import { isSlowConnection } from "@/lib/net";
import {
  buildDayIndex,
  dayJumpTarget,
  readResume,
  writeResume,
  type ResumePoint,
} from "@/lib/public-viewer";
import { cn } from "@/lib/utils";

// Секция «Все фото» рендерится порциями: целиком это сотни кнопок,
// картинок и IntersectionObserver'ов в DOM у гостя с телефона. Анимация входа — только у первых.
const ALL_PHOTOS_PAGE = 60;
const REVEAL_FIRST = 12;

// Листлет тянет осязаемый CSS/JS — на публичную страницу только по требованию
const PublicMap = dynamic(() => import("./public-map").then((m) => m.PublicMap), {
  ssr: false,
  loading: () => <div className="w-full h-[320px] rounded-2xl bg-muted animate-pulse" />,
});

export interface PublicPhoto {
  /** Стабильный ключ фото; из него же клиент собирает keyset-курсор порций */
  id: string;
  url: string;
  thumbUrl: string;
  /** Размеры файла — для aspect-ratio плитки (у старых фото могут отсутствовать) */
  width?: number | null;
  height?: number | null;
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
  /** Всего фото в поездке; в photos лежит первая партия, остальное докачивается фоном */
  photosTotal: number;
  /** Курсор для докачки остального после SSR-партии (формат знает сервер); null/нет — всё уже загружено */
  photosNextCursor?: string | null;
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

// Просмотр на весь экран (слайдшоу и кнопка «полный экран»): картинка вписывается в экран
// целиком и при необходимости увеличивается — горизонтальные кадры занимают всю ширину монитора,
// а не остаются «марками» натурального размера. object-fit: contain — без обрезки
const FILL_IMAGE_STYLE = { width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", objectFit: "contain" } as const;
// Пауза между кадрами слайдшоу: достаточно, чтобы рассказать про кадр, и не засыпаешь
const SLIDESHOW_DELAY_MS = 5000;

interface ViewerState {
  list: PublicPhoto[];
  index: number;
  /** Запущено слайдшоу: автопереключение + полный экран, по окончании альбома стоп */
  show?: boolean;
  /** Браузер сейчас в полноэкранном режиме (включил гость или слайдшоу) */
  fs?: boolean;
  /** Открыт весь альбом по порядку (а не рейл «Лучшие кадры»): только тогда «фото 5 из 24 за день» честное */
  full?: boolean;
}

export function PublicTripView({ trip, token }: { trip: PublicTrip; token: string }) {
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [showFloatingBar, setShowFloatingBar] = useState(false);
  // reduced motion выясняем после монтирования: разница сервер/клиент сломала бы гидрацию
  const [reducedMotion, setReducedMotion] = useState(false);
  const [allShown, setAllShown] = useState(ALL_PHOTOS_PAGE);

  // Фото приходят двумя волнами: первая партия — в SSR (page.tsx), остальные
  // докачиваются фоном порциями с /p/<token>/photos. Полный список нужен странице
  // целиком — главы-дни, «Лучшие кадры», карта и лайтбокс считаются по нему, —
  // поэтому докачку не привязываем к клику «Показать ещё».
  const [photos, setPhotos] = useState(trip.photos);

  useEffect(() => {
    if (trip.photos.length >= trip.photosTotal || !trip.photosNextCursor) return;
    let stopped = false;
    (async () => {
      try {
        // keyset-курсор от последнего фото SSR-партии (его считает сервер); дальше
        // сервер в nextCursor сам говорит, откуда брать следующую порцию
        let cursor: string | null = trip.photosNextCursor ?? null;
        while (!stopped) {
          const res = await fetch(`/p/${token}/photos${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
          if (!res.ok) return;
          const data = (await res.json()) as { photos: PublicPhoto[]; nextCursor: string | null };
          if (stopped) return;
          if (data.photos.length === 0) return;
          setPhotos((prev) => [...prev, ...data.photos]);
          if (!data.nextCursor) return;
          cursor = data.nextCursor;
        }
      } catch {
        // сеть пропала — гость видит, что успело догрузиться; секции не ломаются
      }
    })();
    return () => {
      stopped = true;
    };
  }, [trip.photos, trip.photosTotal, trip.photosNextCursor, token]);

  // Сердечко: анонимный лайк страницы, один тап с устройства (localStorage)
  const [hearts, setHearts] = useState(trip.hearts);
  const [liked, setLiked] = useState(false);
  const [likePending, setLikePending] = useState(false);

  const likeKey = `triptrek:share-like:${token}`;

  // «Продолжить с места»: где гость остановился в прошлый раз. Читаем после монтирования —
  // localStorage на сервере нет, а расхождение разметки сломало бы гидрацию
  const [resume, setResume] = useState<ResumePoint | null>(null);

  useEffect(() => {
    setResume(readResume(token));
  }, [token]);

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

  const allPlaces = useMemo(
    () => trip.days.flatMap((d) => d.places.map((p) => ({ ...p, dayNumber: d.dayNumber }))),
    [trip.days]
  );
  // День на карте: null — вся поездка
  const [mapDay, setMapDay] = useState<number | null>(null);
  const visitedCount = allPlaces.filter((p) => p.visited).length;
  const favorites = useMemo(() => photos.filter((p) => p.isFavorite), [photos]);
  const photosByDay = useMemo(() => {
    const map = new Map<number, PublicPhoto[]>();
    for (const p of photos) {
      if (p.dayNumber == null) continue;
      const list = map.get(p.dayNumber) ?? [];
      list.push(p);
      map.set(p.dayNumber, list);
    }
    return map;
  }, [photos]);
  const indexById = useMemo(() => new Map(photos.map((p, i) => [p.id, i])), [photos]);
  const photoDayIndex = useMemo(() => buildDayIndex(photos), [photos]);
  const cityByDay = useMemo(() => new Map(trip.days.map((d) => [d.dayNumber, d.city])), [trip.days]);
  // «Все фото» по дням: подряд идущие кадры одного дня — одна группа с заголовком
  const allGroups = useMemo(() => {
    const out: { dayNumber: number | null; items: { p: PublicPhoto; i: number }[] }[] = [];
    photos.slice(0, allShown).forEach((p, i) => {
      const last = out[out.length - 1];
      if (last && last.dayNumber === p.dayNumber) last.items.push({ p, i });
      else out.push({ dayNumber: p.dayNumber, items: [{ p, i }] });
    });
    return out;
  }, [photos, allShown]);
  const photoPoints = useMemo(
    () =>
      photos
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, dayNumber: p.dayNumber })),
    [photos]
  );
  // Дни, которым есть что показать на карте (место с координатами или фото с геометкой)
  const mapDays = useMemo(() => {
    const has = new Set<number>();
    for (const p of allPlaces) if (p.lat && p.lng) has.add(p.dayNumber);
    for (const p of photoPoints) if (p.dayNumber != null) has.add(p.dayNumber);
    return trip.days.filter((d) => has.has(d.dayNumber));
  }, [allPlaces, photoPoints, trip.days]);

  // Слайды лайтбокса: раньше собирались заново на каждый свайп вместе с перерисовкой всей
  // страницы; viewer.list от свайпа не меняется, так что мемо держится
  const viewerList = viewer?.list;
  const viewerOpen = !!viewer;
  const viewerFull = !!viewer?.full;
  const viewerFill = !!(viewer?.show || viewer?.fs);
  const viewerDayIndex = useMemo(() => buildDayIndex(viewerList ?? []), [viewerList]);
  const viewerSlides = useMemo(
    () =>
      (viewerList ?? []).map((p, i) => {
        const city = p.dayNumber != null ? cityByDay.get(p.dayNumber) : undefined;
        const start = p.dayNumber != null ? viewerDayIndex.startOf.get(p.dayNumber) : undefined;
        const count = p.dayNumber != null ? viewerDayIndex.countOf.get(p.dayNumber) : undefined;
        return {
          src: p.url,
          width: p.width ?? undefined,
          height: p.height ?? undefined,
          alt: p.caption ?? "Фото поездки",
          title: p.caption ?? undefined,
          description: (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs opacity-85">
              {p.dayNumber != null && (
                <span className="font-medium">
                  День {p.dayNumber}
                  {city ? ` · ${city}` : ""}
                  {/* позиция внутри дня — чтобы было видно, где начало дня и сколько до конца */}
                  {viewerFull && start != null && count != null ? ` · ${i - start + 1} из ${count}` : ""}
                </span>
              )}
              {p.placeName && <span>📍 {p.placeName}</span>}
              {p.takenAt && <span className="opacity-70">{fmtLong(p.takenAt)}</span>}
            </div>
          ),
        };
      }),
    [viewerList, viewerFull, viewerDayIndex, cityByDay]
  );
  // На слабой связи/экономии трафика соседние фото заранее не тянем (см. lib/net.ts)
  const viewerPreload = useMemo(() => (viewerOpen && isSlowConnection() ? 0 : 1), [viewerOpen]);

  // Прыжки по дням в просмотре: «к началу дня / предыдущий день» и «следующий день»
  const prevDayTarget = viewer ? dayJumpTarget(viewer.list, viewer.index, "prev") : null;
  const nextDayTarget = viewer ? dayJumpTarget(viewer.list, viewer.index, "next") : null;
  const viewerPhotoId = viewer ? (viewer.list[viewer.index]?.id ?? null) : null;
  const viewerDayStart = (() => {
    const dn = viewer?.list[viewer.index]?.dayNumber;
    return dn != null ? viewerDayIndex.startOf.get(dn) : undefined;
  })();

  // Запоминаем последнее открытое фото: вернуться можно с этого места, не листая заново.
  // Открытие просмотра гасит плашку «продолжить» — гость уже смотрит
  useEffect(() => {
    if (!viewerPhotoId) return;
    writeResume(token, { kind: "photo", photoId: viewerPhotoId, at: Date.now() });
    setResume(null);
  }, [viewerPhotoId, token]);

  const dateLabel =
    trip.endDate && trip.endDate !== trip.startDate
      ? `${fmtShort(trip.startDate)} — ${fmtShort(trip.endDate)}`
      : fmtShort(trip.startDate) || "скоро в путь";

  const zipUrl = `/p/${token}/photos.zip`;
  const canDownloadZip = trip.allowDownload && photos.length > 0;

  /** Тап по сердечку: поставить или забрать своё (состояние — на устройстве) */
  const toggleLike = async () => {
    if (likePending) return;
    const undo = liked;
    setLikePending(true);
    setLiked(!undo);
    setHearts((h) => Math.max(0, h + (undo ? -1 : 1)));
    try {
      if (undo) localStorage.removeItem(likeKey);
      else localStorage.setItem(likeKey, "1");
    } catch {
      // приватный режим без localStorage — сердечко просто не помнится
    }
    try {
      const r = await fetch(`/p/${token}/heart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undo }),
      });
      if (!r.ok) throw new Error("failed");
      const d = (await r.json()) as { hearts: number; undo: boolean };
      setHearts(d.hearts);
      if (undo && !d.undo) {
        // сервер отказал в декременте (счётчик уже пуст) — считаем сердечко поставленным
        setLiked(true);
        try {
          localStorage.setItem(likeKey, "1");
        } catch {
          // не критично
        }
      }
    } catch {
      // откат — тихо, кнопка снова активна
      setLiked(undo);
      setHearts((h) => Math.max(0, h + (undo ? 1 : -1)));
      try {
        if (undo) localStorage.setItem(likeKey, "1");
        else localStorage.removeItem(likeKey);
      } catch {
        // не критично
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

  // Долистал до дня на странице (не в просмотре) — запоминаем день. Пока висит плашка
  // «продолжить», прошлое место не затираем: гость может просто осматриваться
  // Пишем только при СМЕНЕ дня: иначе закрытие просмотра перезаписало бы только что
  // сохранённое фото днём. Остальное читаем через ref
  const resumeGuard = useRef({ scrolled: false, viewerOpen: false, offered: false });
  useEffect(() => {
    resumeGuard.current = { scrolled: showFloatingBar, viewerOpen, offered: !!resume };
  }, [showFloatingBar, viewerOpen, resume]);
  useEffect(() => {
    const g = resumeGuard.current;
    if (activeDay == null || !g.scrolled || g.viewerOpen || g.offered) return;
    writeResume(token, { kind: "day", dayNumber: activeDay, at: Date.now() });
  }, [activeDay, token]);

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

  // Плашка «Продолжить»: что показать гостю и куда она ведёт
  const resumeCard = (() => {
    if (!resume) return null;
    if (resume.kind === "day") {
      const d = trip.days.find((x) => x.dayNumber === resume.dayNumber);
      return d ? { label: `День ${d.dayNumber} · ${d.city}`, ready: true } : null;
    }
    const idx = indexById.get(resume.photoId);
    if (idx == null) {
      // фото ещё едет с сервера — подождём; докачалось всё, а его нет — удалено, предлагать нечего
      return photos.length < trip.photosTotal ? { label: "Ищем ваше место…", ready: false } : null;
    }
    const p = photos[idx];
    const city = p.dayNumber != null ? cityByDay.get(p.dayNumber) : undefined;
    return {
      label: `Фото ${idx + 1} из ${trip.photosTotal}${p.dayNumber != null ? ` · День ${p.dayNumber}` : ""}${city ? ` · ${city}` : ""}`,
      ready: true,
    };
  })();

  const continueFromResume = () => {
    if (!resume) return;
    if (resume.kind === "day") jumpToDay(resume.dayNumber);
    else {
      const idx = indexById.get(resume.photoId);
      if (idx != null) setViewer({ list: photos, index: idx, full: true });
    }
    setResume(null);
  };

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

          {/* Счётчики поездки: «0 из N мест» на витрине выглядит заброшенностью —
              посещения показываем только когда они есть */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {visitedCount > 0 && (
              <StatChip>
                {visitedCount} из {allPlaces.length} мест
              </StatChip>
            )}
            {cities.length > 0 && (
              <StatChip>
                {cities.length} {plural(cities.length, ["город", "города", "городов"])}
              </StatChip>
            )}
            {trip.photosTotal > 0 && (
              <StatChip>
                {trip.photosTotal} {plural(trip.photosTotal, ["фото", "фото", "фото"])}
              </StatChip>
            )}
          </div>

          {/* Действия гостя: смотреть — главное, скачивание и сердечко — рядом */}
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {photos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setViewer({ list: photos, index: 0, full: true })}
                  className="min-h-11 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 text-sm font-semibold shadow-lg active:scale-95 transition-transform"
                  style={{ boxShadow: `0 8px 24px ${trip.accent}44` }}
                >
                  <Images className="size-4" /> Смотреть все фото
                </button>
              )}
              {photos.length > 1 && (
                <button
                  type="button"
                  onClick={() => setViewer({ list: photos, index: 0, full: true, show: true })}
                  className="min-h-11 inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold hover:bg-accent active:scale-95 transition-all"
                >
                  <Play className="size-4 fill-current" /> Слайдшоу
                </button>
              )}
              {canDownloadZip && (
                <a
                  href={zipUrl}
                  download
                  className="min-h-11 inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold hover:bg-accent active:scale-95 transition-all"
                >
                  <Download className="size-4" /> Скачать ZIP
                </a>
              )}
              <button
                type="button"
                onClick={toggleLike}
                disabled={likePending}
                aria-label={liked ? "Забрать сердечко" : "Оставить сердечко"}
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

      {/* ═══ Продолжить с места, где остановились ═══ */}
      {resumeCard && (
        <section className="pb-4">
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-xl"
                style={{ background: `${trip.accent}22`, color: trip.accent }}
                aria-hidden
              >
                <History className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">Продолжить с того места</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{resumeCard.label}</p>
              </div>
              <button
                type="button"
                onClick={continueFromResume}
                disabled={!resumeCard.ready}
                className="min-h-10 shrink-0 rounded-full px-4 text-xs font-semibold text-white active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
                style={{ background: trip.accent }}
              >
                Продолжить
              </button>
              <button
                type="button"
                onClick={() => setResume(null)}
                aria-label="Не напоминать"
                className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent active:scale-90 transition-transform"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ═══ Лучшие кадры ═══ */}
      {favorites.length > 0 && (
        <section className="pb-2">
          <div className="max-w-2xl mx-auto px-4">
            <SectionTitle icon={<Star className="size-3.5 fill-current" />}>Лучшие кадры</SectionTitle>
            {/* Рейл живёт в той же колонке, что и весь контент — на десктопе
                не спорит с заголовком секции, на мобильном это вся ширина */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-3 pt-1">
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
          </div>
        </section>
      )}

      {/* Совсем свежая поездка: без маршрута и фото страница — приглашение,
          а не обрыв после обложки */}
      {trip.days.length === 0 && trip.photosTotal === 0 && (
        <p className="max-w-md mx-auto px-4 pb-12 text-center text-sm text-muted-foreground leading-relaxed">
          Маршрут и фото появятся здесь позже — путешествие только собирается. Заглядывайте ещё!
        </p>
      )}

      {/* ═══ Зона дней: липкая навигация живёт только внутри неё —
           на галерее и карте «Д1…ДN» уже не нужны ═══ */}
      {trip.days.length > 0 && (
        <div>
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
                  <span className="min-w-0 truncate text-sm font-semibold">{d.city}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtLong(d.date)}</span>
                  {dayPhotos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setViewer({ list: photos, index: indexById.get(dayPhotos[0].id) ?? 0, full: true })}
                      className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold hover:bg-accent active:scale-95 transition-all"
                    >
                      <Images className="size-3.5" /> Смотреть · {dayPhotos.length}
                    </button>
                  )}
                </div>
                {d.title && <h3 className="mt-2 text-lg font-bold leading-snug text-balance">{d.title}</h3>}
                {d.summary && <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{d.summary}</p>}

                {dayPhotos.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-1.5">
                    {shown.map((p, i) => (
                      <button
                        key={p.url + i}
                        type="button"
                        onClick={() => setViewer({ list: photos, index: indexById.get(p.id) ?? 0, full: true })}
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
        </div>
      )}

      {/* ═══ Все фото ═══ */}
      {photos.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 py-7 border-t border-border/60">
          <SectionTitle icon={<Camera className="size-3.5" />}>
            Все фото · {trip.photosTotal}
          </SectionTitle>
          {allGroups.map((g, gi) => (
            <div key={`${g.dayNumber ?? "none"}-${gi}`} className={gi > 0 ? "mt-6" : undefined}>
              {g.dayNumber != null && (
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <span
                    className="text-[11px] font-bold tabular-nums rounded-lg px-2 py-1"
                    style={{ background: `${trip.accent}22`, color: trip.accent }}
                  >
                    Д{g.dayNumber}
                  </span>
                  <span className="min-w-0 truncate">{cityByDay.get(g.dayNumber)}</span>
                  <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                    {photoDayIndex.countOf.get(g.dayNumber)} {plural(photoDayIndex.countOf.get(g.dayNumber) ?? 0, ["фото", "фото", "фото"])}
                  </span>
                </h3>
              )}
              <div className="columns-2 sm:columns-3 gap-2 [&>*]:mb-2">
                {g.items.map(({ p, i }) => (
                  <Reveal
                    key={p.url + i}
                    disabled={reducedMotion || i >= REVEAL_FIRST}
                    delay={Math.min((i % 6) * 0.04, 0.2)}
                    className="break-inside-avoid"
                  >
                    <button
                      type="button"
                      onClick={() => setViewer({ list: photos, index: i, full: true })}
                      className="relative w-full rounded-xl overflow-hidden bg-muted active:scale-[0.98] transition-transform block"
                      aria-label={p.caption ?? "Фото поездки"}
                    >
                      <img
                        src={p.thumbUrl}
                        alt={p.caption ?? ""}
                        loading="lazy"
                        decoding="async"
                        className={cn("w-full object-cover", !(p.width && p.height) && "min-h-[120px]")}
                        // Пропорции из метаданных: колонки не прыгают, а ленивая подгрузка не
                        // считает каждую плитку заглушкой и не тянет вдвое больше, чем видно
                        style={p.width && p.height ? { aspectRatio: `${p.width} / ${p.height}` } : undefined}
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
            </div>
          ))}
          {/* Кнопка живёт в двух состояниях: есть что раскрыть из загруженного —
              раскрываем; порции ещё едут с сервера — ждём (остаток честный, от
              photosTotal, а не от длины загруженного списка) */}
          {(allShown < photos.length || allShown < trip.photosTotal) && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                disabled={allShown >= photos.length}
                onClick={() => setAllShown((n) => n + ALL_PHOTOS_PAGE)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-secondary border border-border px-5 text-xs font-medium active:scale-95 transition-transform disabled:opacity-60 disabled:active:scale-100"
              >
                {allShown < photos.length
                  ? `Показать ещё · осталось ${trip.photosTotal - allShown}`
                  : "Загружаем ещё…"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ═══ Карта ═══ */}
      {allPlaces.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 py-7 border-t border-border/60">
          <SectionTitle icon={<MapPin className="size-3.5" />}>Карта путешествия</SectionTitle>
          {/* День на карте: «Все дни» или один день — его места по порядку маршрута и его фото */}
          {mapDays.length > 1 && (
            <div className="mb-2.5 flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="День на карте">
              {[{ dayNumber: null as number | null, label: "Все дни" }, ...mapDays.map((d) => ({ dayNumber: d.dayNumber as number | null, label: `Д${d.dayNumber}` }))].map(
                (o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={mapDay === o.dayNumber}
                    onClick={() => setMapDay(o.dayNumber)}
                    className={cn(
                      "shrink-0 min-h-8 px-3 rounded-full text-xs font-semibold tabular-nums transition-colors",
                      mapDay === o.dayNumber ? "text-white" : "text-muted-foreground hover:text-foreground bg-muted/60"
                    )}
                    style={mapDay === o.dayNumber ? { background: trip.accent } : undefined}
                  >
                    {o.label}
                  </button>
                )
              )}
            </div>
          )}
          <PublicMap
            places={allPlaces}
            photoPoints={photoPoints}
            activeDay={mapDay}
            accent={trip.accent}
            onPhotoClick={(id) => {
              const i = indexById.get(id);
              if (i != null) setViewer({ list: photos, index: i, full: true });
            }}
          />
          {mapDay != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              День {mapDay} · {cityByDay.get(mapDay)}
              {" — "}
              {allPlaces.filter((p) => p.dayNumber === mapDay && p.lat && p.lng).length} мест,{" "}
              {photoPoints.filter((p) => p.dayNumber === mapDay).length} фото с геометкой
            </p>
          )}
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
            {photos.length > 0 && (
              <button
                type="button"
                onClick={() => setViewer({ list: photos, index: 0, full: true })}
                tabIndex={showFloatingBar ? 0 : -1}
                className="min-h-10 inline-flex items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white active:scale-95 transition-transform"
                style={{ background: trip.accent }}
              >
                <Images className="size-3.5" /> Смотреть
              </button>
            )}
            {canDownloadZip && (
              <a
                href={zipUrl}
                download
                aria-label="Скачать все фото ZIP-архивом"
                tabIndex={showFloatingBar ? 0 : -1}
                className="min-h-10 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 text-xs font-semibold active:scale-95 transition-all"
              >
                <Download className="size-3.5" /> ZIP
              </a>
            )}
            <button
              type="button"
              onClick={toggleLike}
              disabled={likePending}
              aria-label={liked ? "Забрать сердечко" : "Оставить сердечко"}
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
          on={{
            view: ({ index: i }) => setViewer((v) => (v ? { ...v, index: i } : v)),
            enterFullscreen: () => setViewer((v) => (v ? { ...v, fs: true } : v)),
            exitFullscreen: () => setViewer((v) => (v ? { ...v, fs: false } : v)),
          }}
          slides={viewerSlides}
          plugins={[Captions, Counter, Zoom, Fullscreen, Slideshow]}
          // Слайдшоу: сразу полный экран и автопереключение; по окончании альбома стоп, а не по кругу
          fullscreen={{ auto: !!viewer!.show }}
          slideshow={{ autoplay: !!viewer!.show, delay: SLIDESHOW_DELAY_MS }}
          carousel={{
            finite: !!viewer!.show,
            preload: viewer!.show ? 2 : viewerPreload,
            padding: viewerFill ? 0 : "16px",
            imageProps: viewerFill ? { style: FILL_IMAGE_STYLE } : {},
          }}
          controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
          captions={{ showToggle: false }}
          zoom={{ scrollToZoom: true, pinchZoomV4: true }}
          toolbar={{
            buttons: [
              prevDayTarget != null && (
                <button
                  key="prev-day"
                  type="button"
                  aria-label={viewerDayStart != null && viewer!.index > viewerDayStart ? "К началу дня" : "Предыдущий день"}
                  title={viewerDayStart != null && viewer!.index > viewerDayStart ? "К началу дня" : "Предыдущий день"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewer((v) => (v ? { ...v, index: prevDayTarget } : v));
                  }}
                  className="size-11 rounded-full grid place-items-center text-white bg-white/10 hover:bg-white/20 active:scale-90 transition-transform"
                >
                  <ChevronsLeft className="size-5" />
                </button>
              ),
              nextDayTarget != null && (
                <button
                  key="next-day"
                  type="button"
                  aria-label="Следующий день"
                  title="Следующий день"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewer((v) => (v ? { ...v, index: nextDayTarget } : v));
                  }}
                  className="size-11 rounded-full grid place-items-center text-white bg-white/10 hover:bg-white/20 active:scale-90 transition-transform"
                >
                  <ChevronsRight className="size-5" />
                </button>
              ),
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
              "slideshow",
              "fullscreen",
              "close",
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
