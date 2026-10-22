"use client";

import { useCallback, useSyncExternalStore } from "react";

import { queueStore } from "@/lib/upload-queue/browser";
import { EMPTY_SNAPSHOT } from "@/lib/upload-queue/engine";
import type { PauseReason, QueueSnapshot, QueueStats } from "@/lib/upload-queue/types";

/** Полный снимок очереди (все задания): для экранов со списком — менеджер, ревью выбора. */
export function useUploadQueue(): QueueSnapshot {
  return useSyncExternalStore(queueStore.subscribe, queueStore.getSnapshot, queueStore.getServerSnapshot);
}

const getStats = (): QueueStats => queueStore.getSnapshot().stats;
const getServerStats = (): QueueStats => EMPTY_SNAPSHOT.stats;

/**
 * Только счётчики: объект stats переиспользуется движком, пока числа не изменились,
 * поэтому FAB и плашка не перерисовываются на каждый переход статуса одного кадра.
 */
export function useUploadStats(): QueueStats {
  return useSyncExternalStore(queueStore.subscribe, getStats, getServerStats);
}

const getPause = (): PauseReason | null => queueStore.getSnapshot().pause?.reason ?? null;
const getServerPause = (): PauseReason | null => null;

export function useUploadPause(): PauseReason | null {
  return useSyncExternalStore(queueStore.subscribe, getPause, getServerPause);
}

/**
 * Сколько кадров в неотправленном выборе ЭТОЙ поездки. Выбор привязан к поездке (день
 * подбирается по её календарю), поэтому плашка и точка на вкладке считают только текущую.
 */
export function useStagedCount(tripId: string): number {
  const getSnapshot = useCallback(
    () => queueStore.getSnapshot().jobs.reduce((n, j) => n + (!j.committed && j.tripId === tripId ? 1 : 0), 0),
    [tripId]
  );
  return useSyncExternalStore(queueStore.subscribe, getSnapshot, () => 0);
}
