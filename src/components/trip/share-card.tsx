"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Download, X, Loader2, Image as ImageIcon, Copy, Check, Play, Pause, Film } from "lucide-react";
import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useTripStore } from "@/lib/trip-store";
import { CARD_VARIANTS, type CardData, type CardVariantId } from "./share-card-art";
import { currencySymbol } from "@/lib/currencies";

// GIF кодим в половинном размере (540 по ширине) — 36 кадров дают гладкий
// бесшовный цикл, а кодирование на слабых телефонах остаётся в пределах пары секунд
const GIF_FRAMES = 36;
const GIF_SCALE = 0.5;
// Превью рисуем в уменьшенном буфере: 720 по ширине хватает и на retina-плотность,
// при этом рендер карточки каждый кадр остаётся дешёвым
const PREVIEW_WIDTH = 720;

export function ShareCard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useBodyScrollLock(open);
  const tripId = useCurrentTripId();
  const { data: trip } = useTrip();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef(0); // текущая фаза анимации [0..1)
  const startRef = useRef(0); // timestamp начала цикла для склейки фазы после паузы
  const [variantId, setVariantId] = useState<CardVariantId>("story");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [manualT, setManualT] = useState<number | null>(null); // фаза при скраббере/паузе
  const [visibleTick, setVisibleTick] = useState(0); // возврат из скрытой вкладки — перезапустить цикл
  const [gifProgress, setGifProgress] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);

  const variant = CARD_VARIANTS.find((v) => v.id === variantId) ?? CARD_VARIANTS[0];

  // Смена варианта: начинаем с постерной фазы, анимация снова играет
  const pickVariant = (id: CardVariantId) => {
    setVariantId(id);
    phaseRef.current = (CARD_VARIANTS.find((v) => v.id === id) ?? CARD_VARIANTS[0]).posterT;
    setManualT(null);
    setPlaying(!reducedMotion);
  };

  // При запрете «приглашает только владелец» сервер не отдаёт не-владельцу код —
  // здесь лишь прячем кнопку ссылки, чтобы не дразнить ошибкой
  const { data: session } = useAuth();
  const myId = session?.user?.id;
  const isOwner = !!myId && (trip?.participants ?? []).some((m) => m.id === myId && m.role === "owner");
  const canShareInvite = isOwner || trip?.settings.allowMemberInvites !== false;

  // Собираем данные поездки для отрисовки
  const data: CardData | null = useMemo(() => {
    if (!trip) return null;
    const cities: { name: string; days: number }[] = [];
    for (const d of trip.days ?? []) {
      const last = cities[cities.length - 1];
      if (last && last.name === d.city) last.days++;
      else cities.push({ name: d.city, days: 1 });
    }
    const fmt = (iso?: string | null) =>
      iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "") : "";
    const start = trip.settings.startDate;
    const end = trip.settings.endDate;
    const dateLabel =
      start && end
        ? `${fmt(start)} — ${fmt(end)} ${new Date(end).getFullYear()}`
        : start
          ? `с ${fmt(start)}`
          : "скоро в путь";
    return {
      title: trip.settings.title || "TripTrek",
      emoji: (trip.trip as { coverEmoji?: string } | undefined)?.coverEmoji || "🌏",
      accent: (trip.trip as { coverColor?: string } | undefined)?.coverColor || "#f97316",
      destination: (trip.trip as { destination?: string } | undefined)?.destination || "",
      cities,
      dateLabel,
      totalDays: trip.settings.totalDays,
      visited: trip.visitedPlaces,
      totalPlaces: trip.totalPlaces,
      photos: trip.totalPhotos,
      spent: trip.totalSpent,
      currencySymbol: currencySymbol(trip.settings.currency),
      members: trip.participants.map((p) => ({ emoji: p.emoji, color: p.color, name: p.name })),
      // dayProgress может быть отрицательным у ещё не начавшейся поездки — для карточки зажимаем
      progress: Math.max(0, Math.min(100, trip.dayProgress || 0)),
      inviteCode: trip.settings.inviteCode || trip.trip?.inviteCode || "",
    };
  }, [trip]);

  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  /** Отрисовать один кадр в видимом canvas превью */
  const paintPreview = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !data) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const s = canvas.width / variant.width;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      variant.render(ctx, data, t);
    },
    [data, variant]
  );

  // Размер буфера превью под выбранный вариант
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open) return;
    canvas.width = PREVIEW_WIDTH;
    canvas.height = Math.round((variant.height / variant.width) * PREVIEW_WIDTH);
    paintPreview(manualT ?? variant.posterT);
  }, [open, variantId, data]);

  // Живое превью: rAF-цикл играет фазу, продолжая с того места, где остановились
  // (пауза, скраб, скрытая вкладка). На паузе рисуем зафиксированный кадр.
  // rAF не тикает у скрытой вкладки — цикл умрёт и будет перезапущен через visibleTick.
  useEffect(() => {
    if (!open || !data || !ready) return;
    const tick = (now: number) => {
      phaseRef.current = ((now - startRef.current) / variant.loopMs) % 1;
      paintPreview(phaseRef.current);
      if (sliderRef.current) sliderRef.current.value = String(Math.round(phaseRef.current * 1000));
      rafRef.current = requestAnimationFrame(tick);
    };
    if (playing) {
      startRef.current = performance.now() - phaseRef.current * variant.loopMs;
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    }
    const t = manualT ?? variant.posterT;
    paintPreview(t);
    if (sliderRef.current) sliderRef.current.value = String(Math.round(t * 1000));
    return undefined;
  }, [open, data, variantId, playing, ready, visibleTick, paintPreview]);

  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) setVisibleTick((v) => v + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // При открытии: первый кадр — постерный; анимация играет, если система не просит
  // reduced motion (её тогда можно включить кнопкой — это явное действие)
  useEffect(() => {
    if (!open) return;
    setReady(false);
    setManualT(null);
    setGifProgress(null);
    phaseRef.current = variant.posterT;
    setPlaying(!reducedMotion);
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, [open, tripId]);

  if (!open || typeof document === "undefined") return null;

  if (!tripId || !trip || !data) {
    return createPortal(
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center space-y-3"
          >
            <div className="text-4xl">🧭</div>
            <p className="text-sm font-medium">Нет активной поездки</p>
            <p className="text-xs text-muted-foreground">Создай или выбери поездку, чтобы поделиться карточкой</p>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                useTripStore.getState().setTripSwitcherOpen(true);
              }}
              className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
            >
              Мои поездки →
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full min-h-11 text-sm text-muted-foreground"
            >
              Закрыть
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>,
      document.body
    );
  }

  /** Полный кадр в натуральном размере варианта (PNG-экспорт, шаринг) */
  const renderFull = (t: number): HTMLCanvasElement | null => {
    const c = document.createElement("canvas");
    c.width = variant.width;
    c.height = variant.height;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    variant.render(ctx, data, t);
    return c;
  };

  const download = () => {
    const c = renderFull(variant.posterT);
    if (!c) return;
    const link = document.createElement("a");
    link.download = `triptrek-${variantId}-${Date.now()}.png`;
    link.href = c.toDataURL("image/png");
    link.click();
    toast.success("Карточка скачана! 📸");
  };

  const canCopyImage = typeof window !== "undefined" && !!navigator.clipboard && "ClipboardItem" in window;
  const copyImage = async () => {
    try {
      const c = renderFull(variant.posterT);
      if (!c) return;
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
      if (!blob) throw new Error("no blob");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setImageCopied(true);
      toast.success("Карточка в буфере! 📋");
      setTimeout(() => setImageCopied(false), 2000);
    } catch {
      toast.error("Браузер не разрешает копировать картинки", { description: "Скачай файл и вставь вручную" });
    }
  };

  const share = async () => {
    try {
      const c = renderFull(variant.posterT);
      if (!c) return;
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
      if (!blob) return;
      const file = new File([blob], "triptrek.png", { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: trip.settings.title,
          text: "Смотри карточку нашей поездки! 🌏",
        });
      } else {
        download();
      }
    } catch {
      // user cancelled
    }
  };

  /** GIF: рендерим кадры цикла в половинном размере и кодируем на месте.
  Progress-тосты, потому что 36 квантовок занимают пару секунд. */
  const exportGif = async () => {
    if (gifProgress !== null) return;
    // на время кодирования ставим превью на паузу — не делим кадр с rAF-циклом
    setManualT(phaseRef.current);
    setPlaying(false);
    setGifProgress(0);
    try {
      const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
      const w = Math.round(variant.width * GIF_SCALE);
      const h = Math.round(variant.height * GIF_SCALE);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no ctx");
      const enc = GIFEncoder();
      const delay = Math.round(variant.loopMs / GIF_FRAMES / 10) * 10;
      for (let i = 0; i < GIF_FRAMES; i++) {
        const t = i / GIF_FRAMES;
        ctx.setTransform(GIF_SCALE, 0, 0, GIF_SCALE, 0, 0);
        variant.render(ctx, data, t);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const { data: px } = ctx.getImageData(0, 0, w, h);
        const palette = quantize(px, 256);
        const index = applyPalette(px, palette);
        enc.writeFrame(index, w, h, { palette, delay });
        setGifProgress(Math.round(((i + 1) / GIF_FRAMES) * 100));
        // отдаём поток браузеру, чтобы не подвешивать UI на время кодирования
        if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0));
      }
      enc.finish();
      // копия в новый буфер: TS не пускает ArrayBufferLike внутрь BlobPart
      const blob = new Blob([new Uint8Array(enc.bytesView())], { type: "image/gif" });
      const link = document.createElement("a");
      link.download = `triptrek-${variantId}-${Date.now()}.gif`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      toast.success("Живая GIF-карточка готова! 🎞️", { description: `${(blob.size / 1024 / 1024).toFixed(1)} МБ` });
    } catch {
      toast.error("Не удалось собрать GIF", { description: "Попробуй ещё раз или скачай PNG" });
    } finally {
      setGifProgress(null);
    }
  };

  const copyLink = () => {
    const code = trip.settings.inviteCode || trip.trip?.inviteCode || "";
    if (!code) {
      toast.error("Код приглашения ещё не готов");
      return;
    }
    const url = `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Ссылка-приглашение скопирована! 📋");
    setTimeout(() => setCopied(false), 2000);
  };

  const busy = gifProgress !== null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => { onOpenChange(false); }}
        className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-md max-h-[95vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        >
          {/* Handle */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between z-10">
            <h2 className="font-bold text-base flex items-center gap-2">
              <ImageIcon className="size-4" /> Карточка поездки
            </h2>
            <button
              type="button"
              onClick={() => { onOpenChange(false); }}
              aria-label="Закрыть"
              className="size-11 rounded-full hover:bg-accent grid place-items-center"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Выбор варианта */}
            <div className="chip-rail flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {CARD_VARIANTS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={busy}
                  onClick={() => pickVariant(v.id)}
                  className={cn(
                    "shrink-0 min-h-11 px-3.5 rounded-xl border text-left transition-colors flex items-center gap-2 disabled:opacity-60",
                    v.id === variantId
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/60 border-border hover:bg-accent"
                  )}
                >
                  <span className="text-base leading-none">{v.emoji}</span>
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-sm font-medium">{v.label}</span>
                    <span className={cn("text-[10px]", v.id === variantId ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {v.tag}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {/* Живое превью: canvas играет цикл варианта */}
            <div className="relative rounded-2xl overflow-hidden border border-border bg-muted/30">
              <canvas ref={canvasRef} className="w-full block" aria-label={`Карточка поездки — ${variant.label}`} />
              {/* Плеер: пауза/плей + скраббер по фазе анимации */}
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-2 py-1.5 bg-gradient-to-t from-black/55 to-transparent">
                <button
                  type="button"
                  aria-label={playing ? "Пауза" : "Играть"}
                  onClick={() => {
                    if (playing) {
                      setManualT(phaseRef.current);
                      setPlaying(false);
                    } else {
                      setManualT(null);
                      setPlaying(true);
                    }
                  }}
                  className="size-8 shrink-0 rounded-full bg-white/15 hover:bg-white/25 text-white grid place-items-center backdrop-blur-sm"
                >
                  {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
                </button>
                <input
                  ref={sliderRef}
                  type="range"
                  min={0}
                  max={1000}
                  defaultValue={0}
                  aria-label="Кадр анимации"
                  onChange={(e) => {
                    const t = Number(e.target.value) / 1000;
                    if (playing) setPlaying(false);
                    setManualT(t);
                    phaseRef.current = t;
                    paintPreview(t);
                  }}
                  className="flex-1 h-1.5 accent-white cursor-pointer"
                />
              </div>
            </div>

            {/* Кнопки */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={download}
                disabled={busy}
                className="min-h-11 rounded-xl bg-secondary hover:bg-accent py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="size-4" /> PNG
              </button>
              <button
                type="button"
                onClick={share}
                disabled={busy}
                className="min-h-11 rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Share2 className="size-4" /> Поделиться
              </button>
            </div>

            {/* GIF — анимированная версия карточки */}
            <button
              type="button"
              onClick={exportGif}
              disabled={busy}
              className="w-full min-h-11 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/15 text-primary py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-70 transition-colors"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Собираем GIF… {gifProgress}%
                </>
              ) : (
                <>
                  <Film className="size-4" /> Скачать анимированный GIF
                </>
              )}
            </button>

            {/* Копирование картинки — там, где браузер умеет */}
            {canCopyImage && (
              <button
                type="button"
                onClick={copyImage}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 min-h-11 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
              >
                {imageCopied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                {imageCopied ? "Скопировано!" : "Копировать картинку в буфер"}
              </button>
            )}

            {/* Ссылка — только тем, кому разрешено приглашать */}
            {canShareInvite && (
              <button
                type="button"
                onClick={copyLink}
                className="w-full flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground hover:text-foreground min-h-11"
              >
                {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                {copied ? "Скопировано!" : "Копировать ссылку-приглашение"}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
