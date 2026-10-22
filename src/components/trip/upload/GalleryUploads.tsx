"use client";

import { memo, useMemo } from "react";
import { Loader2, WifiOff } from "lucide-react";

import { useUploadPause, useUploadQueue } from "@/hooks/use-upload-queue";
import { useTripStore } from "@/lib/trip-store";
import type { JobView } from "@/lib/upload-queue/types";
import { cn } from "@/lib/utils";
import { PAUSE_TEXT } from "./UploadManager";
import { UploadThumb } from "./UploadThumb";

const RAIL_TILES = 24;

const RailTile = memo(function RailTile({ job }: { job: JobView }) {
  return (
    <div
      className={cn(
        "relative size-14 shrink-0 rounded-lg overflow-hidden bg-muted",
        job.status === "failed" && "ring-2 ring-red-500/70"
      )}
    >
      <UploadThumb id={job.id} hasThumb={job.hasThumb} />
      {job.status === "uploading" && (
        <span className="absolute inset-0 grid place-items-center bg-black/40">
          <Loader2 className="size-4 animate-spin text-white" />
        </span>
      )}
      {job.status === "failed" && <span className="absolute inset-0 bg-red-950/50" />}
    </div>
  );
});

/**
 * Оптимистичная полоса в галерее: кадры видны сразу после «Загрузить», со своим состоянием,
 * а готовые превращаются в обычные плитки ниже (их строки приходят прямо из ответа сервера).
 */
export function GalleryUploads({ tripId }: { tripId: string }) {
  const snap = useUploadQueue();
  const pause = useUploadPause();
  const jobs = useMemo(
    () => snap.jobs.filter((j) => j.committed && j.tripId === tripId),
    [snap.jobs, tripId]
  );
  if (jobs.length === 0) return null;

  const { stats } = snap;
  const pending = jobs.filter((j) => j.status !== "failed").length;
  const failed = jobs.length - pending;
  const progress = stats.sessionTotal > 0 ? stats.sessionDone / stats.sessionTotal : 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-3 space-y-2" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-sm font-medium flex items-center gap-2">
          {pause === "offline" ? (
            <WifiOff className="size-4 shrink-0 text-amber-500" />
          ) : pending > 0 ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          ) : null}
          <span className="truncate">
            {pending > 0 ? `Загружается: ${stats.sessionDone} из ${stats.sessionTotal}` : `Не загрузилось: ${failed}`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => useTripStore.getState().setUploadManagerOpen(true)}
          className="shrink-0 min-h-11 px-2 text-xs font-medium text-primary active:scale-95 transition-transform"
        >
          Подробнее
        </button>
      </div>
      {pending > 0 && (
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {pause && pending > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">{PAUSE_TEXT[pause]}</p>}
      <div className="chip-rail no-scrollbar gap-1.5">
        {jobs.slice(0, RAIL_TILES).map((j) => (
          <RailTile key={j.id} job={j} />
        ))}
      </div>
    </section>
  );
}
