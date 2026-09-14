"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Download, X, Loader2, Image as ImageIcon, Copy, Check } from "lucide-react";
import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useTripStore } from "@/lib/trip-store";
import { CARD_VARIANTS, type CardData, type CardVariantId } from "./share-card-art";

export function ShareCard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useBodyScrollLock(open);
  const tripId = useCurrentTripId();
  const { data: trip } = useTrip();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [variantId, setVariantId] = useState<CardVariantId>("story");
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);

  const variant = CARD_VARIANTS.find((v) => v.id === variantId) ?? CARD_VARIANTS[0];

  // При запрете «приглашает только владелец» сервер не отдаёт не-владельцу код —
  // здесь лишь прячем кнопку ссылки, чтобы не дразнить ошибкой
  const { data: session } = useAuth();
  const myId = session?.user?.id;
  const isOwner = !!myId && (trip?.participants ?? []).some((m) => m.id === myId && m.role === "owner");
  const canShareInvite = isOwner || trip?.settings.allowMemberInvites !== false;

  // Собираем данные поездки для отрисовки
  const buildData = (): CardData | null => {
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
      members: trip.participants.map((p) => ({ emoji: p.emoji, color: p.color, name: p.name })),
      // dayProgress может быть отрицательным у ещё не начавшейся поездки — для карточки зажимаем
      progress: Math.max(0, Math.min(100, trip.dayProgress || 0)),
      inviteCode: trip.settings.inviteCode || trip.trip?.inviteCode || "",
    };
  };

  const generate = (id: CardVariantId) => {
    const v = CARD_VARIANTS.find((x) => x.id === id) ?? CARD_VARIANTS[0];
    const canvas = canvasRef.current;
    const data = buildData();
    if (!canvas || !data) return;
    setGenerating(true);
    try {
      canvas.width = v.width;
      canvas.height = v.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, v.width, v.height);
      v.render(ctx, data);
      setImageUrl(canvas.toDataURL("image/png"));
    } catch {
      toast.error("Не удалось создать карточку");
    } finally {
      setGenerating(false);
    }
  };

  // Автогенерация при открытии и смене варианта
  useEffect(() => {
    if (!open || !trip || !tripId) return;
    const t = setTimeout(() => generate(variantId), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tripId, variantId, trip]);

  if (!open || typeof document === "undefined") return null;

  if (!tripId || !trip) {
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

  const download = () => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.download = `triptrek-${variantId}-${Date.now()}.png`;
    link.href = imageUrl;
    link.click();
    toast.success("Карточка скачана! 📸");
  };

  const canCopyImage = typeof window !== "undefined" && !!navigator.clipboard && "ClipboardItem" in window;
  const copyImage = async () => {
    if (!imageUrl) return;
    try {
      const blob = await (await fetch(imageUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setImageCopied(true);
      toast.success("Карточка в буфере! 📋");
      setTimeout(() => setImageCopied(false), 2000);
    } catch {
      toast.error("Браузер не разрешает копировать картинки", { description: "Скачай файл и вставь вручную" });
    }
  };

  const share = async () => {
    if (!imageUrl) return;
    try {
      const blob = await (await fetch(imageUrl)).blob();
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

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => { onOpenChange(false); setImageUrl(null); }}
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
              onClick={() => { onOpenChange(false); setImageUrl(null); }}
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
                  onClick={() => setVariantId(v.id)}
                  className={cn(
                    "shrink-0 min-h-11 px-3.5 rounded-xl border text-left transition-colors flex items-center gap-2",
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

            {/* Превью */}
            {generating || !imageUrl ? (
              <div className="text-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Рисуем карточку «{variant.label}»…</p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden border border-border">
                <img src={imageUrl} alt={`Карточка поездки — ${variant.label}`} className="w-full block" />
              </div>
            )}

            {/* Canvas (скрытый) */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Кнопки */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={download}
                disabled={!imageUrl}
                className="min-h-11 rounded-xl bg-secondary hover:bg-accent py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="size-4" /> Скачать
              </button>
              <button
                type="button"
                onClick={share}
                disabled={!imageUrl}
                className="min-h-11 rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Share2 className="size-4" /> Поделиться
              </button>
            </div>

            {/* Копирование картинки — там, где браузер умеет */}
            {canCopyImage && (
              <button
                type="button"
                onClick={copyImage}
                disabled={!imageUrl}
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
