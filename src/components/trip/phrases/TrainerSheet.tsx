"use client";

// Тренажёр: флешкарты «по-русски → как на месте?».
// Видишь русский текст — вспоминаешь, тапаешь, проверяешь себя.

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, Check, RotateCcw, Trophy, X } from "lucide-react";
import { cn, plural } from "@/lib/utils";
import type { Phrase } from "@/hooks/use-trip";
import { pronunciationLabel } from "./constants";
import { buzz, speakPhrase, stopSpeaking } from "./shared";
import { detectLanguage } from "@/lib/language-detect";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";

const ROUND_SIZE = 10;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function TrainerSheet({
  open,
  onOpenChange,
  pool,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pool: Phrase[];
}) {
  const [deck, setDeck] = useState<Phrase[]>([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [round, setRound] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  const active = open && pool.length > 0;
  // Колоду собираем при открытии, а не на каждый рендер
  const started = deck.length > 0;
  const card = started ? deck[pos] : null;
  const done = started && pos >= deck.length;
  const lang = card ? detectLanguage(card.cn) : null;

  const startRound = () => {
    stopSpeaking();
    setDeck(shuffle(pool).slice(0, ROUND_SIZE));
    setPos(0);
    setFlipped(false);
    setKnown(0);
    setRound((r) => r + 1);
  };

  const close = () => {
    stopSpeaking();
    onOpenChange(false);
  };

  const answer = (remembered: boolean) => {
    buzz(remembered ? 12 : [20, 40, 20]);
    if (!remembered) {
      // не помню — карточка вернётся в конце раунда
      setDeck((d) => [...d, d[pos]]);
    } else {
      setKnown((k) => k + 1);
    }
    setFlipped(false);
    setPos((p) => p + 1);
  };

  const progress = useMemo(() => (started ? Math.min(pos / deck.length, 1) : 0), [started, pos, deck.length]);

  return (
    <MobileBottomSheet open={open} onOpenChange={close} title="Тренажёр" titleIcon={<Trophy className="size-5 text-amber-500" />}>
      {!active ? (
        <p className="text-sm text-muted-foreground text-center py-6">Нет фраз для тренировки</p>
      ) : !started ? (
        <div className="space-y-4 text-center py-2">
          <div className="text-5xl">🎓</div>
          <div>
            <p className="font-semibold">Раунд из {Math.min(ROUND_SIZE, pool.length)} {plural(Math.min(ROUND_SIZE, pool.length), "карточки", "карточек", "карточек")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Читаешь фразу по-русски — вспоминаешь, как сказать на месте. Не помнишь — карточка вернётся.
            </p>
          </div>
          <button
            type="button"
            onClick={startRound}
            className="min-h-12 w-full rounded-xl bg-primary text-primary-foreground font-medium active:scale-[0.98] transition-transform"
          >
            Начать
          </button>
        </div>
      ) : done ? (
        <div className="space-y-4 text-center py-2">
          {/* Итог раунда — «печать» */}
          <motion.div
            initial={{ scale: 1.6, opacity: 0, rotate: -14 }}
            animate={{ scale: 1, opacity: 1, rotate: -6 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="mx-auto w-fit px-6 py-3 rounded-xl border-4 border-emerald-500 text-emerald-500 font-black uppercase tracking-widest text-lg"
          >
            Готово
          </motion.div>
          <p className="text-sm text-muted-foreground">
            Помнишь {known} из {deck.length} {plural(deck.length, "карточки", "карточек", "карточек")} · раунд {round}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="flex-1 min-h-12 rounded-xl bg-secondary font-medium active:scale-[0.98] transition-transform"
            >
              Закрыть
            </button>
            <button
              type="button"
              onClick={startRound}
              className="flex-1 min-h-12 rounded-xl bg-primary text-primary-foreground font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
            >
              <RotateCcw className="size-4" /> Ещё раунд
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Прогресс */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
            <button type="button" onClick={close} className="size-9 grid place-items-center rounded-full hover:bg-accent" aria-label="Завершить">
              <X className="size-4" />
            </button>
          </div>

          {/* Карточка: тап = перевернуть */}
          <div className="relative min-h-[240px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.button
                key={`${card!.id}-${flipped ? "back" : "front"}-${pos}`}
                type="button"
                onClick={() => {
                  buzz();
                  setFlipped((f) => !f);
                }}
                initial={{ rotateX: 88, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                exit={{ rotateX: -88, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "absolute inset-0 rounded-2xl border-2 p-5 flex flex-col items-center justify-center text-center gap-2 active:scale-[0.98] transition-transform",
                  flipped ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                )}
              >
                {!flipped ? (
                  <>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Как это сказать?</span>
                    <span className="text-2xl font-bold leading-snug">{card!.ru}</span>
                    <span className="text-xs text-muted-foreground mt-2">Тапни, чтобы проверить себя</span>
                  </>
                ) : (
                  <>
                    <span className="text-3xl font-bold leading-tight break-words">{card!.cn}</span>
                    {card!.pinyin && <span className="text-base italic text-muted-foreground">{card!.pinyin}</span>}
                    <span className="text-sm text-foreground/70 mt-1">{card!.ru}</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!speaking) speakPhrase(card!.cn, { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
                      }}
                      className="mt-2 size-11 rounded-full bg-primary/10 text-primary grid place-items-center"
                      role="button"
                      aria-label="Произнести"
                    >
                      <Volume2 className={cn("size-5", speaking && "animate-pulse")} />
                    </span>
                    <span className="text-[10px] text-muted-foreground">{lang ? pronunciationLabel(lang.langPrefix) : ""}</span>
                  </>
                )}
              </motion.button>
            </AnimatePresence>
          </div>

          {/* Ответы — появляются после переворота */}
          <AnimatePresence>
            {flipped && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex gap-2"
              >
                <button
                  type="button"
                  onClick={() => answer(false)}
                  className="flex-1 min-h-12 rounded-xl bg-secondary font-medium active:scale-[0.98] transition-transform"
                >
                  Ещё раз
                </button>
                <button
                  type="button"
                  onClick={() => answer(true)}
                  className="flex-1 min-h-12 rounded-xl bg-emerald-600 text-white font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                >
                  <Check className="size-4" /> Помню
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <p className="text-[11px] text-muted-foreground text-center">
            Карточка {pos + 1} — осталось {deck.length - pos}
          </p>
        </div>
      )}
    </MobileBottomSheet>
  );
}
