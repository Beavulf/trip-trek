"use client";

// Карточка проживания на «нити» вкладки: статус и ночи сверху, название крупно,
// подробности (время, бронь, телефон, цена, заметки) и действия — по раскрытию.
// Текущее проживание раскрыто само, прошедшие — приглушены и свёрнуты.

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, ChevronDown, ExternalLink, Pencil, StickyNote, Ticket, Wallet, Clock } from "lucide-react";
import { cn, fmtMoney, plural } from "@/lib/utils";
import {
  formatStayRange,
  nightNumber,
  nightsOf,
  lodgingPhase,
  type Lodging,
  type LodgingPhase,
} from "@/lib/lodging";
import { copyText, StayActions } from "./stay-actions";

const PHASE: Record<LodgingPhase, { label: string; chip: string; dot: string }> = {
  current: { label: "Сейчас", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  upcoming: { label: "Скоро", chip: "bg-primary/15 text-primary", dot: "bg-primary" },
  past: { label: "Был", chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
};

interface LodgingCardProps {
  lodging: Lodging;
  todayKey: string;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onEdit: () => void;
  onTaxi: () => void;
  currencySymbol: string;
  /** Даты пересекаются с другим проживанием */
  overlapping: boolean;
}

export function LodgingCard({
  lodging: l,
  todayKey,
  index,
  expanded,
  onToggle,
  canEdit,
  onEdit,
  onTaxi,
  currencySymbol,
  overlapping,
}: LodgingCardProps) {
  const reduceMotion = useReducedMotion();
  const phase = lodgingPhase(l, todayKey);
  const meta = PHASE[phase];
  const nights = nightsOf(l);
  const place = [l.city, l.address].filter(Boolean).join(" · ");

  const details: { key: string; icon: React.ReactNode; node: React.ReactNode }[] = [];
  if (l.checkInTime || l.checkOutTime) {
    details.push({
      key: "time",
      icon: <Clock className="size-3.5" />,
      node: [l.checkInTime && `заезд с ${l.checkInTime}`, l.checkOutTime && `выезд до ${l.checkOutTime}`].filter(Boolean).join(" · "),
    });
  }
  if (l.bookingRef) {
    details.push({
      key: "ref",
      icon: <Ticket className="size-3.5" />,
      node: (
        <button type="button" onClick={() => copyText(l.bookingRef ?? "", "Номер брони скопирован")} className="font-mono underline decoration-dotted underline-offset-2 text-left">
          {l.bookingRef}
        </button>
      ),
    });
  }
  if (l.bookingUrl) {
    details.push({
      key: "url",
      icon: <ExternalLink className="size-3.5" />,
      node: (
        <a href={l.bookingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          Открыть бронь
        </a>
      ),
    });
  }
  if (l.price != null && l.price > 0) {
    details.push({
      key: "price",
      icon: <Wallet className="size-3.5" />,
      node: (
        <>
          {currencySymbol}
          {fmtMoney(l.price)}
          {nights > 0 && <span className="text-muted-foreground"> · {currencySymbol}{fmtMoney(l.price / nights)} / ночь</span>}
        </>
      ),
    });
  }
  if (l.notes) {
    details.push({ key: "notes", icon: <StickyNote className="size-3.5" />, node: <span className="whitespace-pre-line">{l.notes}</span> });
  }

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.05, 0.3), duration: 0.25 }}
      className="relative pl-8"
    >
      {/* Станция на нити */}
      <span
        className={cn(
          "absolute left-0 top-4 size-[22px] rounded-full grid place-items-center ring-4 ring-background",
          meta.dot
        )}
        aria-hidden
      >
        {phase === "past" ? <Check className="size-3 text-background" /> : <span className="size-2 rounded-full bg-white" />}
      </span>

      <article
        className={cn(
          "rounded-2xl border bg-card overflow-hidden transition-colors",
          phase === "current" ? "border-emerald-500/40 shadow-lg shadow-emerald-500/5" : "border-border",
          phase === "past" && !expanded && "opacity-80"
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="w-full text-left p-3.5 flex items-start gap-2"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.chip)}>{meta.label}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums">
                {nights > 0 ? `🌙 ${nights} ${plural(nights, "ночь", "ночи", "ночей")}` : "без ночёвки"}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{formatStayRange(l)}</span>
              {phase === "current" && nights > 1 && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                  · ночь {nightNumber(l, todayKey)} из {nights}
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold leading-tight break-words">{l.name}</h3>
            {l.nameLocal && <p className="text-sm text-muted-foreground break-words">{l.nameLocal}</p>}
            {place && <p className={cn("text-xs text-muted-foreground break-words", !expanded && "line-clamp-1")}>{place}</p>}
            {overlapping && (
              <p className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3.5" /> Даты пересекаются с другим жильём
              </p>
            )}
          </div>
          <ChevronDown className={cn("size-5 mt-1 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </button>

        {expanded && (
          <div className="px-3.5 pb-3.5 space-y-3 border-t border-border/60 pt-3">
            {details.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {details.map((d) => (
                  <li key={d.key} className="flex items-start gap-2">
                    <span className="mt-0.5 text-muted-foreground">{d.icon}</span>
                    <span className="min-w-0 break-words">{d.node}</span>
                  </li>
                ))}
              </ul>
            )}
            <StayActions lodging={l} tone="card" onTaxi={onTaxi} />
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="w-full min-h-11 rounded-xl text-xs font-medium text-muted-foreground inline-flex items-center justify-center gap-1.5 hover:bg-muted transition-colors"
              >
                <Pencil className="size-3.5" /> Изменить
              </button>
            )}
          </div>
        )}
      </article>
    </motion.li>
  );
}
