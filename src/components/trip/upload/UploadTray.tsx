"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ImagePlus, Pause, WifiOff } from "lucide-react";

import { useCurrentTripId } from "@/hooks/use-trip";
import { useStagedCount, useUploadPause, useUploadStats } from "@/hooks/use-upload-queue";
import { useTripStore } from "@/lib/trip-store";
import type { PauseReason } from "@/lib/upload-queue/types";
import { ProgressRing } from "./ProgressRing";
import { UploadManager } from "./UploadManager";

type TrayKind = "uploading" | "paused" | "failed" | "staged";

function pausedLabel(reason: PauseReason, pending: number): string {
  if (reason === "offline") return `Нет сети · ${pending} в очереди`;
  if (reason === "auth") return "Войдите снова";
  if (reason === "rate") return `Лимит · ${pending} ждут`;
  return `Пауза · ${pending} в очереди`;
}

/**
 * Плашка над FAB: загрузка идёт в фоне, пока юзер пользуется приложением. Показывается,
 * только когда есть что сказать: идёт отправка, она на паузе, есть упавшие кадры или
 * недосланный выбор (восстановлен после закрытия приложения).
 */
export function UploadTray() {
  const stats = useUploadStats();
  const pause = useUploadPause();
  const staged = useStagedCount(useCurrentTripId());
  const reduceMotion = useReducedMotion();
  const pending = stats.waiting + stats.uploading;

  let kind: TrayKind | null = null;
  if (pending > 0) kind = pause ? "paused" : "uploading";
  else if (stats.failed > 0) kind = "failed";
  else if (staged > 0) kind = "staged";

  const open = () => {
    const st = useTripStore.getState();
    // Недосланный выбор отправляется в шите добавления, остальное разбирается в менеджере
    if (kind === "staged") st.setQuickAddOpen(true);
    else st.setUploadManagerOpen(true);
  };

  let label = "";
  if (kind === "uploading") label = `Загрузка ${stats.sessionDone}/${stats.sessionTotal}`;
  else if (kind === "paused" && pause) label = pausedLabel(pause, pending);
  else if (kind === "failed") label = `Не загрузилось: ${stats.failed}`;
  else if (kind === "staged") label = `Не отправлено: ${staged}`;

  const progress = stats.sessionTotal > 0 ? stats.sessionDone / stats.sessionTotal : 0;

  return (
    <>
      <AnimatePresence>
        {kind && (
          <motion.button
            key="upload-tray"
            type="button"
            onClick={open}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed z-40 right-4 sm:right-6 inline-flex items-center gap-2 min-h-11 pl-2.5 pr-3.5 rounded-full border border-border bg-card/95 text-foreground shadow-lg text-xs font-medium active:scale-95"
            style={{ bottom: "calc(6.25rem + env(safe-area-inset-bottom, 0px))" }}
            aria-label={`${label}. Открыть список загрузки`}
          >
            {kind === "uploading" && <ProgressRing value={progress} className="size-6 text-primary" />}
            {kind === "paused" &&
              (pause === "offline" ? (
                <WifiOff className="size-5 text-amber-500" aria-hidden="true" />
              ) : pause === "user" ? (
                <Pause className="size-5 text-amber-500" aria-hidden="true" />
              ) : (
                <AlertTriangle className="size-5 text-amber-500" aria-hidden="true" />
              ))}
            {kind === "failed" && <AlertTriangle className="size-5 text-red-500" aria-hidden="true" />}
            {kind === "staged" && <ImagePlus className="size-5 text-primary" aria-hidden="true" />}
            <span className="tabular-nums">{label}</span>
          </motion.button>
        )}
      </AnimatePresence>
      <UploadManager />
    </>
  );
}

/** Кольцо прогресса вокруг FAB: загрузку видно, даже когда плашка не нужна. */
export function FabUploadRing() {
  const stats = useUploadStats();
  const pending = stats.waiting + stats.uploading;
  if (pending === 0) return null;
  const progress = stats.sessionTotal > 0 ? stats.sessionDone / stats.sessionTotal : 0;
  return (
    <span className="pointer-events-none absolute -inset-1.5 text-white" aria-hidden="true">
      <ProgressRing value={progress} className="size-full" />
    </span>
  );
}
