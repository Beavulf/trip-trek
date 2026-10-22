"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { Check, Loader2, MapPin, Plus, X } from "lucide-react";
import { toast } from "sonner";

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
import { useTrip } from "@/hooks/use-trip";
import { useUploadQueue } from "@/hooks/use-upload-queue";
import { dayIdForDate } from "@/lib/trip-days";
import { getUploadQueue } from "@/lib/upload-queue/browser";
import type { DayResolver, JobView } from "@/lib/upload-queue/types";
import { cn } from "@/lib/utils";
import { UploadThumb } from "../upload/UploadThumb";
import { DayPicker } from "./DayPicker";
import { StickySubmit } from "./StickySubmit";

// Выбор пачки из галереи — «ревью» перед отправкой. Сама подготовка (сжатие, превью,
// EXIF, sha256) и отправка живут в фоновой очереди (lib/upload-queue): кадры начинают
// готовиться сразу после выбора, а «Загрузить» отдаёт пачку очереди и закрывает шит —
// дальше можно пользоваться приложением, закрытие или сворачивание очередь не рвёт.
// Раньше загрузка держалась на этом компоненте: закрыл шит — оборвал очередь,
// а превью были полноразмерными оригиналами (100 кадров = вылет вкладки на телефоне).

/** Больше стольких кадров «Отменить» просит подтверждения — подготовленный выбор жалко терять тапом. */
const CONFIRM_DISCARD_FROM = 6;

const BatchTile = memo(function BatchTile({
  job,
  dayNumber,
  onRemove,
}: {
  job: JobView;
  dayNumber: number | null;
  onRemove: (id: string) => void;
}) {
  const duplicate = job.status === "duplicate";
  const failed = job.status === "failed";
  return (
    <div
      // Невидимые плитки браузер не рисует: на выборе в сотню кадров скролл остаётся плавным
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden bg-muted [content-visibility:auto] [contain-intrinsic-size:auto_80px]",
        duplicate && "opacity-50"
      )}
    >
      <UploadThumb id={job.id} hasThumb={job.hasThumb} />
      {job.hasCoords && (
        <MapPin className="absolute top-1 left-1 size-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
      )}
      {dayNumber != null && !duplicate && !failed && (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
          Д{dayNumber}
        </span>
      )}
      {job.status === "preparing" && (
        <span className="absolute inset-0 grid place-items-center bg-black/40">
          <Loader2 className="size-5 animate-spin text-white" />
        </span>
      )}
      {failed && (
        <span
          className="absolute inset-0 grid place-items-center bg-red-950/60 p-1 text-center text-[10px] leading-tight text-white"
          title={job.error || "Не удалось обработать"}
        >
          <span className="line-clamp-3">{job.error || "Не удалось обработать"}</span>
        </span>
      )}
      {duplicate && (
        <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center text-[10px] font-medium text-white">
          уже в поездке
        </span>
      )}
      <button
        type="button"
        onClick={() => onRemove(job.id)}
        aria-label="Убрать фото"
        className="absolute top-0.5 right-0.5 size-6 rounded-full bg-black/60 text-white grid place-items-center active:scale-90 transition-transform"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
});

interface PhotoBatchProps {
  batchId: string;
  /** Пачка отдана очереди — шит можно закрывать */
  onDone: () => void;
  /** Выбор отброшен — вернуться к кнопкам «Снять / Из галереи» */
  onCancel: () => void;
  /** Дописать кадры в тот же выбор */
  onAddMore: () => void;
}

export function PhotoBatch({ batchId, onDone, onCancel, onAddMore }: PhotoBatchProps) {
  const { data: trip } = useTrip();
  const snap = useUploadQueue();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // День для кадров без даты съёмки: выбор юзера, пока не выбрал — текущий день поездки
  // (render-derived, без set-state-in-effect)
  const [pickedDayId, setPickedDayId] = useState<string | null>(null);

  const jobs = useMemo(() => snap.jobs.filter((j) => j.batchId === batchId), [snap.jobs, batchId]);
  const days = useMemo(() => trip?.days ?? [], [trip]);
  const defaultDayId = useMemo(
    () => days.find((d) => d.dayNumber === trip?.currentDayNumber)?.id ?? days[0]?.id ?? "",
    [days, trip?.currentDayNumber]
  );
  const fallbackDayId = pickedDayId ?? defaultDayId;
  const dayNumberById = useMemo(() => new Map(days.map((d) => [d.id, d.dayNumber])), [days]);

  const dayOf = (takenAt: number | null): string =>
    (takenAt ? dayIdForDate(days, new Date(takenAt)) : null) ?? fallbackDayId;

  let preparing = 0;
  let ready = 0;
  let duplicates = 0;
  let noDate = 0;
  for (const j of jobs) {
    if (j.status === "preparing") preparing++;
    else if (j.status === "duplicate") duplicates++;
    else if (j.status === "ready") {
      ready++;
      if (!(j.takenAt && dayIdForDate(days, new Date(j.takenAt)))) noDate++;
    }
  }
  const queueable = ready + preparing;
  const finished = jobs.length - preparing;

  const remove = useCallback((id: string) => getUploadQueue().remove(id), []);

  const send = () => {
    if (!fallbackDayId) {
      toast.error("Выберите день");
      return;
    }
    const resolve: DayResolver = (takenAt) => (takenAt ? dayIdForDate(days, takenAt) : null) ?? fallbackDayId;
    const { queued, skipped } = getUploadQueue().commit(batchId, resolve);
    if (!queued) {
      toast.info("Нечего отправлять — все кадры уже в поездке");
      return;
    }
    toast.success(`Грузим ${queued} фото в фоне`, {
      description: skipped
        ? `Пропущено: ${skipped} (уже в поездке или не прочитались). Можно пользоваться приложением`
        : "Можно пользоваться приложением — загрузка не прервётся",
    });
    onDone();
  };

  const discard = () => {
    getUploadQueue().discard(batchId);
    onCancel();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="text-sm font-medium">
          {jobs.length} фото
          {preparing > 0 && (
            <span className="text-muted-foreground font-normal">
              {" "}
              · готово {finished}/{jobs.length}…
            </span>
          )}
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onAddMore}
            className="inline-flex items-center gap-1 text-xs text-primary font-medium min-h-11 px-2 active:scale-95 transition-transform"
          >
            <Plus className="size-3.5" /> Ещё
          </button>
          <button
            type="button"
            onClick={() => (jobs.length >= CONFIRM_DISCARD_FROM ? setConfirmDiscard(true) : discard())}
            className="text-xs text-muted-foreground hover:text-foreground min-h-11 px-2"
          >
            Отменить
          </button>
        </div>
      </div>

      {preparing > 0 && (
        <div className="h-1 rounded-full bg-muted overflow-hidden" role="progressbar" aria-label="Подготовка фото">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${jobs.length ? (finished / jobs.length) * 100 : 0}%` }}
          />
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {jobs.map((j) => (
          <BatchTile
            key={j.id}
            job={j}
            dayNumber={dayNumberById.get(dayOf(j.takenAt)) ?? null}
            onRemove={remove}
          />
        ))}
      </div>

      {noDate > 0 && (
        <div className="rounded-xl border border-border p-2.5 space-y-2">
          <div className="text-xs text-muted-foreground">
            {noDate} фото без даты съёмки — положим в выбранный день:
          </div>
          <DayPicker value={fallbackDayId} onChange={setPickedDayId} />
        </div>
      )}

      {preparing > 0 && queueable > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          Остальные ещё готовятся — отправятся сами, как только будут готовы.
        </p>
      )}

      <StickySubmit>
        <button
          type="button"
          onClick={send}
          disabled={queueable === 0}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px] active:scale-[0.98] transition-transform"
        >
          {queueable > 0 ? (
            <>
              <Check className="size-4" /> Загрузить {queueable} фото
            </>
          ) : duplicates > 0 && preparing === 0 ? (
            <>Все фото уже в поездке</>
          ) : (
            <>Нечего загружать</>
          )}
        </button>
      </StickySubmit>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить выбор?</AlertDialogTitle>
            <AlertDialogDescription>
              {jobs.length} фото не отправлены. Придётся выбрать их заново.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Оставить</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                discard();
              }}
            >
              Сбросить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
