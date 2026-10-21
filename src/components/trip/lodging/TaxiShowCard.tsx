"use client";

// «Таксисту»: название и адрес жилья во весь экран — показать водителю, когда
// своими словами не объяснить. Устроен как ShowCard разговорника (портал над
// всем, тёмный фон), но без озвучки и листания: отель один.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Copy, X } from "lucide-react";
import { toast } from "sonner";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
import { phraseFontSize } from "../phrases/shared";

interface TaxiShowCardProps {
  /** Крупно: название на местном языке, если оно есть */
  name: string;
  /** Мелко под названием: как жильё называется по-нашему */
  subtitle?: string | null;
  address: string | null;
  city: string | null;
  onClose: () => void;
}

export function TaxiShowCard({ name, subtitle, address, city, onClose }: TaxiShowCardProps) {
  useBodyScrollLock(true);
  useBackDismiss(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = () => {
    const text = [name, address].filter(Boolean).join("\n");
    void navigator.clipboard?.writeText(text).then(
      () => toast.success("Скопировано"),
      () => toast.error("Не удалось скопировать")
    );
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Показать адрес водителю"
      className="fixed inset-0 z-[10100] flex flex-col bg-gradient-to-b from-indigo-950 via-[#141331] to-black text-white"
    >
      <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="size-12 grid place-items-center rounded-full bg-white/10 active:scale-90 transition-transform"
          aria-label="Закрыть"
        >
          <X className="size-5" />
        </button>
        <span className="text-sm text-white/70">🚕 Отвезите меня сюда</span>
        <span className="size-12" aria-hidden />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-5 min-h-0 overflow-y-auto">
        {city && <p className="text-xs uppercase tracking-widest text-white/60 mb-3">{city}</p>}
        <p className="font-bold leading-tight break-words" style={{ fontSize: phraseFontSize(name) }}>
          {name}
        </p>
        {subtitle && <p className="mt-3 text-base text-white/60 break-words">{subtitle}</p>}
        {address && (
          <>
            <div className="mt-6 h-px w-16 bg-white/20" />
            <p className="mt-5 text-2xl leading-snug text-white/90 break-words">{address}</p>
          </>
        )}
      </div>

      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex justify-center">
        <button
          type="button"
          onClick={copy}
          className="min-h-11 px-5 rounded-full bg-white/10 text-sm font-medium inline-flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <Copy className="size-4" /> Копировать
        </button>
      </div>
    </motion.div>,
    document.body
  );
}
