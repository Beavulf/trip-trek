"use client";

// Show-режим: фраза во весь экран — покажи телефон таксисту/продавцу.
// Свайп ←/→ или стрелки листают текущую выборку, 🔊 говорит, 🐢 медленно.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Volume2, Turtle, Star, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTogglePhraseFavorite, type Phrase } from "@/hooks/use-trip";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { categoryMeta, pronunciationLabel } from "./constants";
import { buzz, speakPhrase, stopSpeaking, phraseFontSize } from "./shared";
import { detectLanguage } from "@/lib/language-detect";

export function ShowCard({
  phrases,
  index,
  onIndexChange,
  onClose,
}: {
  phrases: Phrase[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  useBodyScrollLock(true);
  const toggle = useTogglePhraseFavorite();
  const [speaking, setSpeaking] = useState(false);
  const phrase = phrases[index];

  useEffect(() => stopSpeaking, []);

  const go = (delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= phrases.length) return;
    stopSpeaking();
    setSpeaking(false);
    buzz();
    onIndexChange(next);
  };

  // Клавиатура: стрелки листают, Escape закрывает
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, phrases.length]);

  const speak = (slow = false) => {
    if (!phrase || speaking) return;
    speakPhrase(phrase.cn, { slow, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${phrase.cn}${phrase.pinyin ? ` (${phrase.pinyin})` : ""} — ${phrase.ru}`);
      buzz();
      toast.success("Скопировано");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  if (!phrase || typeof document === "undefined") return null;

  const meta = categoryMeta(phrase.category);
  const lang = detectLanguage(phrase.cn);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="show-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10100] flex flex-col bg-gradient-to-b from-indigo-950 via-[#141331] to-black text-white"
      >
        {/* Верхняя панель */}
        <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => {
              stopSpeaking();
              onClose();
            }}
            className="size-12 grid place-items-center rounded-full bg-white/10 active:scale-90 transition-transform"
            aria-label="Закрыть"
          >
            <X className="size-5" />
          </button>
          <div className="text-sm text-white/60 tabular-nums">
            {index + 1} / {phrases.length}
          </div>
          <button
            type="button"
            onClick={() =>
              toggle.mutate(
                { id: phrase.id, favorite: !phrase.favorite },
                { onError: () => toast.error("Не удалось обновить избранное") }
              )
            }
            className={cn(
              "size-12 grid place-items-center rounded-full active:scale-90 transition-transform",
              phrase.favorite ? "text-amber-400" : "text-white/60"
            )}
            aria-label={phrase.favorite ? "Убрать из избранного" : "Добавить в избранное"}
          >
            <Star className={cn("size-6", phrase.favorite && "fill-current")} />
          </button>
        </div>

        {/* Фраза: свайпабельная середина */}
        <motion.div
          className="flex-1 flex flex-col items-center justify-center text-center px-5 min-h-0"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.x < -60) go(1);
            else if (info.offset.x > 60) go(-1);
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={phrase.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.16 }}
              className="max-w-full"
            >
              <span
                className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full mb-4"
                style={{ background: `${meta?.color}33`, color: "#fff" }}
              >
                {meta?.emoji} {meta?.label}
              </span>
              <button type="button" onClick={() => speak()} className="block w-full active:scale-[0.98] transition-transform">
                <span className="block font-bold leading-tight break-words" style={{ fontSize: phraseFontSize(phrase.cn) }}>
                  {phrase.cn}
                </span>
                {phrase.pinyin && (
                  <span className="block mt-4 text-xl md:text-2xl text-indigo-200 italic">{phrase.pinyin}</span>
                )}
              </button>
              <div className="mt-6 h-px w-16 bg-white/20 mx-auto" />
              <p className="mt-5 text-xl text-white/85">{phrase.ru}</p>
              <p className="mt-1.5 text-xs text-white/40">{pronunciationLabel(lang.langPrefix)}</p>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Нижние органы управления */}
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3">
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              className="size-12 grid place-items-center rounded-full bg-white/10 active:scale-90 transition-transform disabled:opacity-25"
              aria-label="Предыдущая фраза"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => speak()}
              disabled={speaking}
              className={cn(
                "size-20 rounded-full grid place-items-center shadow-2xl active:scale-90 transition-transform disabled:opacity-70",
                speaking ? "bg-white text-indigo-950 animate-pulse" : "bg-white/95 text-indigo-950"
              )}
              aria-label={speaking ? "Произносим…" : "Произнести фразу"}
            >
              <Volume2 className="size-9" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={index >= phrases.length - 1}
              className="size-12 grid place-items-center rounded-full bg-white/10 active:scale-90 transition-transform disabled:opacity-25"
              aria-label="Следующая фраза"
            >
              <ChevronRight className="size-6" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => speak(true)}
              disabled={speaking}
              className="min-h-11 px-4 rounded-full bg-white/10 text-xs font-medium inline-flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40"
            >
              <Turtle className="size-4" /> Медленно
            </button>
            <button
              type="button"
              onClick={copy}
              className="min-h-11 px-4 rounded-full bg-white/10 text-xs font-medium inline-flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <Copy className="size-4" /> Копировать
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
