import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { invalidateRouteData } from "@/lib/query-keys";
import { useTripStore } from "@/lib/trip-store";
import type { Photo } from "@/lib/types";
import { setUploadBusy } from "./busy";
import { UploadEngine, EMPTY_SNAPSHOT } from "./engine";
import { uploadPhoto } from "./http-upload";
import { createBestStore } from "./idb-store";
import { isPhotoLike, mergePhotos, photosKeyAccepts } from "./photo-merge";
import { prepareForUpload } from "./prepare";
import type { DrainSummary, QueueSnapshot } from "./types";

// Браузерная обвязка очереди (singleton на вкладку): IndexedDB + fetch + реакция на
// жизненный цикл страницы — сворачивание, возврат, пропажу сети, закрытие. Сам движок
// (engine.ts) про браузер ничего не знает и покрыт юнит-тестами.

let queryClient: QueryClient | null = null;
let engine: UploadEngine | null = null;

// ── превью: object URL живёт, пока живо задание ─────────────────────────────

const thumbUrls = new Map<string, string>();

/** URL маленького превью задания (создаётся лениво и освобождается, когда задание уходит). */
export function thumbUrlFor(id: string): string | null {
  const hit = thumbUrls.get(id);
  if (hit) return hit;
  const blob = engine?.getThumb(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  thumbUrls.set(id, url);
  return url;
}

function revokeThumbUrl(id: string): void {
  const url = thumbUrls.get(id);
  if (!url) return;
  thumbUrls.delete(id);
  URL.revokeObjectURL(url);
}

// ── кэш галереи ─────────────────────────────────────────────────────────────

const hashSets = new WeakMap<object, Set<string>>();

/** Отпечаток уже есть в загруженной галерее поездки — кадр помечается дублем до отправки. */
function isKnownHash(tripId: string, hash: string): boolean {
  const list = queryClient?.getQueryData<Photo[]>(["photos", tripId, undefined, undefined]);
  if (!Array.isArray(list)) return false;
  let set = hashSets.get(list);
  if (!set) {
    set = new Set();
    for (const p of list) if (p.contentHash) set.add(p.contentHash);
    hashSets.set(list, set);
  }
  return set.has(hash);
}

const uploadedBuffer: { tripId: string; photo: Photo }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Кадры, принятые сервером, копятся и вставляются в кэш галереи одной пачкой (без рефетча на каждый). */
function pushUploadedPhoto(tripId: string, raw: unknown): void {
  if (!isPhotoLike(raw)) return;
  uploadedBuffer.push({ tripId, photo: raw });
  if (!flushTimer) flushTimer = setTimeout(flushUploadedPhotos, 300);
}

function flushUploadedPhotos(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const qc = queryClient;
  const batch = uploadedBuffer.splice(0);
  if (!qc || !batch.length) return;
  for (const q of qc.getQueryCache().findAll({ queryKey: ["photos"] })) {
    const mine = batch.filter((b) => photosKeyAccepts(q.queryKey, b.tripId, b.photo)).map((b) => b.photo);
    if (!mine.length) continue;
    qc.setQueryData<Photo[]>(q.queryKey, (old) => (Array.isArray(old) ? mergePhotos(old, mine) : old));
  }
}

/** Очередь опустела: один рефетч на всё (карта, маршрут, счётчики) вместо рефетча на каждый кадр. */
function onDrain({ done, failed }: DrainSummary): void {
  flushUploadedPhotos();
  const qc = queryClient;
  if (qc) {
    qc.invalidateQueries({ queryKey: ["photos"] });
    qc.invalidateQueries({ queryKey: ["photos-geo"] });
    invalidateRouteData(qc);
  }
  if (failed > 0) {
    toast.error(done > 0 ? `Загружено ${done}, не удалось ${failed}` : `Не удалось загрузить ${failed} фото`, {
      description: "Откройте список — упавшие кадры можно отправить повторно",
      action: { label: "Открыть", onClick: () => useTripStore.getState().setUploadManagerOpen(true) },
      duration: 10_000,
    });
  } else if (done > 1) {
    // Одиночный кадр юзер уже отпраздновал тостом «Фото добавлено» при отправке — второй не нужен
    toast.success(`Загружено ${done} фото 📸`);
  }
}

// ── сборка движка ───────────────────────────────────────────────────────────

export function getUploadQueue(): UploadEngine {
  if (!engine) {
    engine = new UploadEngine({
      store: createBestStore(),
      prepare: prepareForUpload,
      upload: uploadPhoto,
      onUploaded: (meta, photo) => pushUploadedPhoto(meta.tripId, photo),
      onDrain,
      onJobGone: revokeThumbUrl,
      isKnownHash,
      isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
      onPersistError: () =>
        toast.warning("Очередь не сохраняется на устройстве", {
          id: "upload-persist",
          description: "Не закрывайте приложение, пока идёт загрузка",
          duration: 8_000,
        }),
    });
  }
  return engine;
}

/**
 * Стабильный фасад для useSyncExternalStore: идентичность subscribe/getSnapshot не меняется,
 * а на сервере (SSR) вместо движка отдаётся пустой снимок.
 */
export const queueStore = {
  subscribe: (cb: () => void): (() => void) =>
    typeof window === "undefined" ? () => {} : getUploadQueue().subscribe(cb),
  getSnapshot: (): QueueSnapshot => (typeof window === "undefined" ? EMPTY_SNAPSHOT : getUploadQueue().getSnapshot()),
  getServerSnapshot: (): QueueSnapshot => EMPTY_SNAPSHOT,
};

// ── жизненный цикл страницы ─────────────────────────────────────────────────

/** Экран не гаснет, пока идёт загрузка: уснувший телефон замораживает вкладку и рвёт запросы. */
function createWakeLock() {
  let sentinel: WakeLockSentinel | null = null;
  return {
    async acquire() {
      if (sentinel || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
      if (document.visibilityState !== "visible") return;
      try {
        const s = await navigator.wakeLock.request("screen");
        sentinel = s;
        s.addEventListener("release", () => {
          if (sentinel === s) sentinel = null;
        });
      } catch {
        sentinel = null; // экономия энергии / нет разрешения — не критично
      }
    },
    release() {
      const s = sentinel;
      sentinel = null;
      void s?.release().catch(() => {});
    },
  };
}

/** Короткое сворачивание (смена вкладки, шторка) очередь не тревожит — только долгое. */
const LONG_HIDDEN_MS = 3_000;

/**
 * Запуск очереди для залогиненного пользователя (вызывается из оболочки приложения):
 * восстанавливает недоотправленное с прошлого запуска и вешает слушатели жизненного цикла.
 * Возвращает отписку.
 */
export function startUploadQueue(qc: QueryClient, userId: string): () => void {
  queryClient = qc;
  const q = getUploadQueue();
  const wake = createWakeLock();

  void q.init(userId).then(({ committed }) => {
    // Повторный вход без перезагрузки: пауза «нужно войти» должна сняться, а не ждать сворачивания
    q.resumedFromBackground(0);
    // id дедупит повторный вызов (StrictMode, перемонтирование оболочки)
    if (committed > 0) toast.info(`Продолжаем загрузку: ${committed} фото`, { id: "upload-resume", duration: 5_000 });
  });

  let wasActive = false;
  const sync = () => {
    const active = q.getSnapshot().active;
    setUploadBusy(active);
    if (active === wasActive) return;
    wasActive = active;
    if (active) {
      void wake.acquire();
      // Просим браузер не вычищать наше хранилище при нехватке места, пока в нём чужие фото
      void navigator.storage?.persist?.().catch(() => {});
    } else {
      wake.release();
    }
  };
  const unsubscribe = q.subscribe(sync);
  sync();

  let hiddenAt = 0;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    // Wake Lock снимается браузером при сворачивании — вернуть, если загрузка ещё идёт
    if (wasActive) void wake.acquire();
    if (hiddenAt && Date.now() - hiddenAt >= LONG_HIDDEN_MS) q.resumedFromBackground(hiddenAt);
    hiddenAt = 0;
  };
  // Возврат из bfcache (iOS Safari): страница «ожила» без visibilitychange
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) q.resumedFromBackground(Date.now());
  };
  const onOnline = () => q.networkRestored();
  const onOffline = () => q.networkLost();
  // Закрытие вкладки с идущей отправкой: кадры сохранены и доедут при следующем запуске,
  // но юзеру стоит знать, что прямо сейчас они уйти не успеют
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!q.hasPending()) return;
    e.preventDefault();
    e.returnValue = "";
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("beforeunload", onBeforeUnload);
    wake.release();
    setUploadBusy(false);
  };
}
