"use client";

import { memo, useMemo, useState } from "react";
import { AlertTriangle, Check, CloudUpload, Loader2, Pause, Play, RotateCcw, WifiOff, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCurrentTripId } from "@/hooks/use-trip";
import { useStagedCount, useUploadPause, useUploadQueue } from "@/hooks/use-upload-queue";
import { getUploadQueue } from "@/lib/upload-queue/browser";
import type { JobView, PauseReason } from "@/lib/upload-queue/types";
import { useTripStore } from "@/lib/trip-store";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { UploadThumb } from "./UploadThumb";

// Сколько плиток рисуем в менеджере: на 300 кадрах нужен счётчик и ошибки, а не стена превью
const VISIBLE_TILES = 60;

export const PAUSE_TEXT: Record<PauseReason, string> = {
  offline: "Нет сети — продолжим, как только появится",
  rate: "Слишком много загрузок подряд — продолжим автоматически",
  auth: "Нужно войти снова — загрузка на паузе",
  user: "Загрузка на паузе",
};

const JobTile = memo(function JobTile({ job }: { job: JobView }) {
  const failed = job.status === "failed";
  return (
    <div
      className={cn("relative aspect-square rounded-lg overflow-hidden bg-muted", failed && "ring-2 ring-red-500/70")}
      title={failed ? job.error || "Не загрузилось" : undefined}
    >
      <UploadThumb id={job.id} hasThumb={job.hasThumb} />
      {job.status === "uploading" && (
        <span className="absolute inset-0 grid place-items-center bg-black/40">
          <Loader2 className="size-5 animate-spin text-white" />
        </span>
      )}
      {failed && (
        <>
          <span className="absolute inset-0 bg-red-950/50" />
          <div className="absolute inset-x-0 bottom-0 flex justify-between p-0.5">
            {job.canRetry ? (
              <button
                type="button"
                onClick={() => getUploadQueue().retry(job.id)}
                aria-label="Повторить загрузку"
                className="size-7 rounded-full bg-black/70 text-white grid place-items-center active:scale-90 transition-transform"
              >
                <RotateCcw className="size-3.5" />
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => getUploadQueue().remove(job.id)}
              aria-label="Убрать фото"
              className="size-7 rounded-full bg-black/70 text-white grid place-items-center active:scale-90 transition-transform"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
});

/** Шит «Загрузка фото»: прогресс, пауза, повтор упавших, отмена. Открывается с плашки и из тостов. */
export function UploadManager() {
  const open = useTripStore((s) => s.uploadManagerOpen);
  const setOpen = useTripStore((s) => s.setUploadManagerOpen);
  const snap = useUploadQueue();
  const pause = useUploadPause();
  const staged = useStagedCount(useCurrentTripId());
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { stats } = snap;
  const pending = stats.waiting + stats.uploading;
  const { items, hidden } = useMemo(() => {
    const rank = (j: JobView) => (j.status === "failed" ? 0 : j.status === "uploading" ? 1 : 2);
    const sent = snap.jobs.filter((j) => j.committed).sort((a, b) => rank(a) - rank(b));
    return { items: sent.slice(0, VISIBLE_TILES), hidden: Math.max(0, sent.length - VISIBLE_TILES) };
  }, [snap.jobs]);
  const retryable = snap.jobs.some((j) => j.committed && j.status === "failed" && j.canRetry);
  const progress = stats.sessionTotal > 0 ? stats.sessionDone / stats.sessionTotal : 0;
  const userPaused = pause === "user";

  const title =
    pending > 0
      ? `Загружено ${stats.sessionDone} из ${stats.sessionTotal}`
      : stats.failed > 0
        ? `Не загрузилось: ${stats.failed}`
        : "Всё загружено";

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={setOpen}
      title="Загрузка фото"
      titleIcon={<CloudUpload className="size-4" />}
    >
      <div className="space-y-3" aria-live="polite">
        <div>
          <div className="text-sm font-medium">{title}</div>
          {stats.sessionTotal > 0 && (
            <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>

        {pause && pending > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {pause === "offline" ? <WifiOff className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
            {PAUSE_TEXT[pause]}
          </div>
        )}

        {!snap.persistent && pending > 0 && (
          <div className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
            Очередь не сохраняется на устройстве — не закрывайте приложение, пока идёт загрузка.
          </div>
        )}

        {(pending > 0 || retryable) && (
          <div className="flex flex-wrap gap-2">
            {pending > 0 && (
              <button
                type="button"
                onClick={() => getUploadQueue().setUserPaused(!userPaused)}
                className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl border border-border text-sm font-medium active:scale-95 transition-transform"
              >
                {userPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                {userPaused ? "Продолжить" : "Пауза"}
              </button>
            )}
            {retryable && (
              <button
                type="button"
                onClick={() => getUploadQueue().retryFailed()}
                className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-transform"
              >
                <RotateCcw className="size-4" />
                Повторить упавшие
              </button>
            )}
            {pending > 0 && (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 active:scale-95 transition-transform"
              >
                Отменить всё
              </button>
            )}
          </div>
        )}

        {items.length > 0 ? (
          <div className="grid grid-cols-4 gap-1.5">
            {items.map((j) => (
              <JobTile key={j.id} job={j} />
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Check className="size-6 text-emerald-500" />
            Очередь пуста
          </div>
        )}
        {hidden > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            и ещё {hidden}
          </p>
        )}
        {staged > 0 && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              useTripStore.getState().setQuickAddOpen(true);
            }}
            className="w-full min-h-11 rounded-xl border border-dashed border-border text-sm text-muted-foreground active:scale-[0.98] transition-transform"
          >
            Не отправлено: {staged} — открыть выбор
          </button>
        )}
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить загрузку?</AlertDialogTitle>
            <AlertDialogDescription>
              Уже загруженные кадры останутся в поездке. Остальные уйдут из очереди — их можно будет выбрать заново.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить загрузку</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmCancel(false);
                getUploadQueue().cancelPending();
              }}
            >
              Отменить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileBottomSheet>
  );
}
