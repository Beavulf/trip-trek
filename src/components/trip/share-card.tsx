"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Download, X, Loader2, Image as ImageIcon, Copy, Check } from "lucide-react";
import { useTrip } from "@/hooks/use-trip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

export function ShareCard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useBodyScrollLock(open);
  const { data: trip } = useTrip();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open || typeof document === "undefined" || !trip) return null;

  const generateCard = async () => {
    setGenerating(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Размер — 1080×1920 (Instagram story) или 1080×1080 (square)
      canvas.width = 1080;
      canvas.height = 1920;

      // Фон градиент
      const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
      grad.addColorStop(0, trip.settings.title?.includes("China") ? "#f97316" : "#6366f1");
      grad.addColorStop(0.5, "#ec4899");
      grad.addColorStop(1, "#1c1917");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);

      // Декоративные круги
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.arc(900, 200, 200, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(200, 1700, 250, 0, Math.PI * 2);
      ctx.fill();

      // Emoji поездки
      const tripEmoji = (trip.trip as { coverEmoji?: string })?.coverEmoji || "🌏";
      ctx.font = "120px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(tripEmoji, 540, 200);

      // Заголовок
      ctx.fillStyle = "white";
      ctx.font = "bold 56px system-ui, sans-serif";
      ctx.textAlign = "center";
      const title = trip.settings.title || "TripTrek";
      wrapText(ctx, title, 540, 340, 900, 64);

      // Подзаголовок
      ctx.font = "32px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(`${trip.settings.totalDays} дней в пути`, 540, 480);

      // Разделитель
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(100, 560);
      ctx.lineTo(980, 560);
      ctx.stroke();

      // Статистика — карточки
      const stats = [
        { icon: "📍", value: `${trip.visitedPlaces}/${trip.totalPlaces}`, label: "мест" },
        { icon: "📸", value: `${trip.totalPhotos}`, label: "фото" },
        { icon: "📔", value: `${trip.totalJournals}`, label: "записей" },
        { icon: "💰", value: `$${trip.totalSpent.toFixed(0)}`, label: "потрачено" },
      ];

      const cardWidth = 420;
      const cardHeight = 200;
      const cardGap = 40;
      const startX = (1080 - cardWidth * 2 - cardGap) / 2;
      const startY = 640;

      stats.forEach((stat, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = startX + col * (cardWidth + cardGap);
        const y = startY + row * (cardHeight + cardGap);

        // Карточка
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        roundRect(ctx, x, y, cardWidth, cardHeight, 24);
        ctx.fill();

        // Иконка
        ctx.font = "48px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(stat.icon, x + cardWidth / 2, y + 80);

        // Значение
        ctx.font = "bold 44px system-ui, sans-serif";
        ctx.fillStyle = "white";
        ctx.fillText(stat.value, x + cardWidth / 2, y + 145);

        // Лейбл
        ctx.font = "24px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText(stat.label, x + cardWidth / 2, y + 175);
      });

      // Участники
      const members = trip.participants.slice(0, 5);
      ctx.font = "28px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.textAlign = "center";
      ctx.fillText("Участники:", 540, 1130);

      // Аватары участников
      const avatarSize = 80;
      const avatarGap = 20;
      const totalAvatarWidth = members.length * (avatarSize + avatarGap) - avatarGap;
      const avatarStartX = (1080 - totalAvatarWidth) / 2;

      members.forEach((m, i) => {
        const x = avatarStartX + i * (avatarSize + avatarGap);
        const y = 1180;

        // Круг
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(x + avatarSize / 2, y + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();

        // Emoji
        ctx.font = "40px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.emoji, x + avatarSize / 2, y + avatarSize / 2 + 4);
      });
      ctx.textBaseline = "alphabetic";

      // Прогресс-бар
      const progressY = 1400;
      ctx.font = "28px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.textAlign = "center";
      ctx.fillText(`Прогресс: ${trip.dayProgress}%`, 540, progressY);

      // Бар
      const barX = 140;
      const barY = progressY + 30;
      const barWidth = 800;
      const barHeight = 24;

      ctx.fillStyle = "rgba(255,255,255,0.15)";
      roundRect(ctx, barX, barY, barWidth, barHeight, 12);
      ctx.fill();

      ctx.fillStyle = "white";
      roundRect(ctx, barX, barY, barWidth * (trip.dayProgress / 100), barHeight, 12);
      ctx.fill();

      // Логотип
      ctx.font = "bold 36px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.textAlign = "center";
      ctx.fillText("TripTrek", 540, 1700);

      ctx.font = "24px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillText("Совместное путешествие", 540, 1740);

      // Конверт в PNG
      const dataUrl = canvas.toDataURL("image/png");
      setImageUrl(dataUrl);
    } catch {
      toast.error("Не удалось создать карточку");
    } finally {
      setGenerating(false);
    }
  };

  const download = () => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.download = `triptrek-${Date.now()}.png`;
    link.href = imageUrl;
    link.click();
    toast.success("Карточка скачана! 📸");
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
          text: "Смотри статистику нашей поездки! 🌏",
        });
      } else {
        download();
      }
    } catch {
      // user cancelled
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopied(true);
    toast.success("Ссылка скопирована! 📋");
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
          className="bg-card w-full sm:max-w-md max-h-[95vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto"
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
            <button onClick={() => { onOpenChange(false); setImageUrl(null); }} className="size-8 rounded-full hover:bg-accent grid place-items-center">
              <X className="size-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Превью */}
            {!imageUrl ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">{(trip.trip as { coverEmoji?: string })?.coverEmoji || "🌏"}</div>
                <p className="text-sm text-muted-foreground">Создай красивую карточку со статистикой поездки</p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden border border-border">
                <img src={imageUrl} alt="Trip card" className="w-full block" />
              </div>
            )}

            {/* Canvas (скрытый) */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Кнопки */}
            {!imageUrl ? (
              <button
                onClick={generateCard}
                disabled={generating}
                className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {generating ? <Loader2 className="size-5 animate-spin" /> : <ImageIcon className="size-5" />}
                {generating ? "Создание…" : "Создать карточку"}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={download}
                  className="rounded-xl bg-secondary hover:bg-accent py-3 font-medium flex items-center justify-center gap-2"
                >
                  <Download className="size-4" /> Скачать
                </button>
                <button
                  onClick={share}
                  className="rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2"
                >
                  <Share2 className="size-4" /> Поделиться
                </button>
              </div>
            )}

            {/* Ссылка */}
            <button
              onClick={copyLink}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
              {copied ? "Скопировано!" : "Копировать ссылку"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// Helpers для Canvas
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let lineCount = 0;

  for (const word of words) {
    const testLine = line + word + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = word + " ";
      lineCount++;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y + lineCount * lineHeight);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
