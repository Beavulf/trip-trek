"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { X, Copy, Check, Share2, Users, Link as LinkIcon, Loader2 } from "lucide-react";
import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

export function InviteFriends({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useBodyScrollLock(open);
  const tripId = useCurrentTripId();
  const { data: trip, isLoading, isError, refetch } = useTrip();
  const { setTripSwitcherOpen } = useTripStore();
  const [copied, setCopied] = useState(false);

  if (!open || typeof document === "undefined") return null;

  const inviteCode = trip?.settings.inviteCode || "";
  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join?code=${encodeURIComponent(inviteCode)}`
      : `/join?code=${encodeURIComponent(inviteCode)}`;

  const copyLink = async () => {
    if (!inviteCode) {
      toast.error("Код ещё загружается");
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Ссылка скопирована! 📋");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Не удалось скопировать", { description: "Скопируйте ссылку вручную" });
    }
  };

  const share = async () => {
    if (!inviteCode) {
      toast.error("Код ещё загружается");
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: trip?.settings.title || "TripTrek",
          text: "Присоединяйся к моей поездке! 🌏",
          url: inviteUrl,
        });
      } catch {
        // user cancelled
      }
    } else {
      await copyLink();
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-y-auto"
        >
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2">
              <Users className="size-4" /> Пригласить друзей
            </h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="size-11 rounded-full hover:bg-accent grid place-items-center"
              aria-label="Закрыть"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {!tripId ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm font-medium">Нет активной поездки</p>
                <p className="text-xs text-muted-foreground">Выбери поездку, чтобы пригласить друзей</p>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    setTripSwitcherOpen(true);
                  }}
                  className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary text-primary-foreground px-4 text-sm font-medium"
                >
                  Мои поездки →
                </button>
              </div>
            ) : isError ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm font-medium">Не удалось загрузить код</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary text-primary-foreground px-4 text-sm font-medium"
                >
                  Обновить
                </button>
              </div>
            ) : isLoading || !inviteCode ? (
              <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Загружаем код приглашения…
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-2xl shadow-lg">
                    <QRCodeSVG
                      value={inviteUrl}
                      size={180}
                      level="M"
                      fgColor="#1c1917"
                      bgColor="#ffffff"
                    />
                  </div>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  Покажи QR-код другу или отправь ссылку
                </p>

                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-muted-foreground">Код:</span>
                  <code className="px-3 py-1.5 rounded-lg bg-muted font-mono font-bold text-sm tracking-wider">
                    {inviteCode}
                  </code>
                </div>

                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/50">
                  <LinkIcon className="size-4 text-muted-foreground shrink-0" />
                  <input
                    readOnly
                    value={inviteUrl}
                    className="flex-1 bg-transparent text-xs outline-none text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    className={cn(
                      "size-11 rounded-lg grid place-items-center transition-colors shrink-0",
                      copied ? "bg-green-500 text-white" : "bg-secondary hover:bg-accent"
                    )}
                    aria-label="Копировать ссылку"
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="min-h-11 rounded-xl bg-secondary hover:bg-accent py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                    {copied ? "Скопировано!" : "Копировать"}
                  </button>
                  <button
                    type="button"
                    onClick={share}
                    className="min-h-11 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <Share2 className="size-4" />
                    Поделиться
                  </button>
                </div>

                <div className="text-[11px] text-muted-foreground text-center">
                  Друг откроет ссылку → увидит поездку → зарегистрируется → присоединится
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
