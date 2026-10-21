"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTrip, useUploadPhoto } from "@/hooks/use-trip";
import { invalidateRouteData } from "@/lib/query-keys";
import { Check, Loader2, MapPin, RotateCcw, Square, X } from "lucide-react";
import { toast } from "sonner";
import { compressImageForUpload } from "@/lib/image-compress";
import { readPhotoExif } from "@/lib/photo-exif";
import { computeFileHash } from "@/lib/photo-hash";
import { dayIdForDate } from "@/lib/trip-days";
import { usePhotos } from "@/hooks/use-trip";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/lib/trip-store";
import { DayPicker } from "./DayPicker";
import { StickySubmit } from "./StickySubmit";

// Вечерний батч «все фото за день» — сценарий из ретро-кейса 2026-10 (Китай):
// выбираем пачкой из галереи, каждый кадр обрабатывается отдельно (сжатие +
// EXIF), день подбирается автоматически по дате съёмки, загрузка — очередью
// с ретраем упавших. Всё, кроме последнего кадра, летит suppressPush, чтобы
// друзья получили один пуш «добавил 50 фото», а не 50 пушей.

type Status = "preparing" | "ready" | "uploading" | "done" | "error";

interface BatchItem {
  key: string;
  origin: File;
  uploadFile: File | null; // сжатая копия; null — сжатие не удалось
  preview: string;
  exifCoords: { lat: number; lng: number } | null;
  exifTakenAt: Date | null;
  /** sha256 оригинала — дедуп повторной загрузки */
  hash: string | null;
  duplicate: boolean;
  status: Status;
  /** Почему упало — показывается в бейдже-подсказке и итоговом тосте */
  errorMessage?: string;
}

interface PhotoBatchProps {
  files: File[];
  onDone: () => void;
  onCancel: () => void;
}

export function PhotoBatch({ files, onDone, onCancel }: PhotoBatchProps) {
  const { data: trip } = useTrip();
  // invalidate:false — батч инвалидирует галерею ОДИН раз после очереди;
  // раньше каждый кадр дёргал полный рефетч (46 рефетчей = лаги интерфейса)
  const upload = useUploadPhoto({ invalidate: false });
  const setPhotoBatchRunning = useTripStore((st) => st.setPhotoBatchRunning);
  const qc = useQueryClient();
  // Уже загруженные в поездку кадры: по отпечаткам помечаем дубли ещё до
  // загрузки (запрос 2026-10: «не давал загрузить те что уже есть»)
  const { data: existingPhotos } = usePhotos();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0); // готовых к загрузке + упавших в подготовке
  // День для фото без EXIF-даты: выбор юзера, пока не выбрал — текущий день
  // поездки (render-derived, без set-state-in-effect)
  const [pickedDayId, setPickedDayId] = useState<string | null>(null);
  const stopRef = useRef(false);
  const previewsRef = useRef<string[]>([]);
  const existingHashesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const set = new Set<string>();
    for (const ph of existingPhotos ?? []) if (ph.contentHash) set.add(ph.contentHash);
    existingHashesRef.current = set;
  }, [existingPhotos]);

  const days = useMemo(() => trip?.days ?? [], [trip]);
  const defaultDayId = useMemo(
    () =>
      days.find((d) => d.dayNumber === trip?.currentDayNumber)?.id ?? days[0]?.id ?? "",
    [days, trip?.currentDayNumber]
  );
  const fallbackDayId = pickedDayId ?? defaultDayId;

  // Подготовка очереди: по одному файлу (EXIF + сжатие), чтобы не жечь память
  // телефона на 50 полноразмерных кадрах одновременно
  useEffect(() => {
    stopRef.current = false;
    void (async () => {
      for (const [i, f] of files.entries()) {
        if (stopRef.current) return;
        const preview = URL.createObjectURL(f);
        previewsRef.current.push(preview);
        const item: BatchItem = {
          key: `${Date.now()}-${i}-${f.name}`,
          origin: f,
          uploadFile: null,
          preview,
          exifCoords: null,
          exifTakenAt: null,
          hash: null,
          duplicate: false,
          status: "preparing",
        };
        setItems((prev) => [...prev, item]);
        try {
          const [exif, compressed, hash] = await Promise.all([
            readPhotoExif(f),
            compressImageForUpload(f).catch(() => null),
            computeFileHash(f),
          ]);
          if (stopRef.current) return;
          setItems((prev) =>
            prev.map((it) =>
              it.key === item.key
                ? {
                    ...it,
                    exifCoords: exif?.coords ?? null,
                    exifTakenAt: exif?.takenAt ?? null,
                    uploadFile: compressed,
                    hash,
                    duplicate: !!hash && existingHashesRef.current.has(hash),
                    status: compressed ? "ready" : "error",
                  }
                : it
            )
          );
        } catch {
          setItems((prev) =>
            prev.map((it) => (it.key === item.key ? { ...it, status: "error" } : it))
          );
        }
        setProcessed((n) => n + 1);
      }
    })();
    return () => {
      stopRef.current = true;
      // принудительное закрытие мимо confirm-диалога: флаг в сторе снять,
      // иначе следующий открытый шит подумает, что загрузка ещё идёт
      useTripStore.getState().setPhotoBatchRunning(false);
      previewsRef.current.forEach((u) => URL.revokeObjectURL(u));
      previewsRef.current = [];
    };
    // files фиксируется родителем при выборе — меняется только на новый батч
  }, []);

  // Закрытие вкладки/обновление страницы во время загрузки — браузер спросит.
  // Свернуть приложение не перехватить: кадры при этом обычно догружаются в фоне,
  // а недогруженные после возврата не задвоятся (дедуп по хэшу)
  useEffect(() => {
    if (!running) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [running]);

  const dayOf = (it: BatchItem): string =>
    (it.exifTakenAt ? dayIdForDate(days, it.exifTakenAt) : null) ?? fallbackDayId;
  const dayNumber = (dayId: string): number | null =>
    days.find((d) => d.id === dayId)?.dayNumber ?? null;

  const noDateCount = items.filter(
    (it) => !(it.exifTakenAt && dayIdForDate(days, it.exifTakenAt))
  ).length;

  const queue = items.filter(
    (it) =>
      !it.duplicate &&
      (it.status === "ready" || (it.status === "error" && it.uploadFile))
  );
  const duplicateCount = items.filter((it) => it.duplicate).length;
  const doneCount = items.filter((it) => it.status === "done").length;
  const failedCount = items.filter((it) => it.status === "error").length;
  const preparing = processed < files.length;
  const uploadedInRun = queue.filter((it) => it.status === "done").length;

  const runUpload = async () => {
    const run = items.filter(
      (it) =>
        !it.duplicate &&
        (it.status === "ready" || (it.status === "error" && it.uploadFile))
    );
    if (!run.length) {
      toast.info("Все выбранные фото уже в поездке");
      return;
    }
    if (!fallbackDayId) return;
    stopRef.current = false;
    setRunning(true);
    setPhotoBatchRunning(true);
    let ok = 0;
    let err = 0;
    let lastError = "";

    // Одиночная загрузка кадра с одним автоматическим ретраем: мобильные сети
    // рвут соединения (20 ECONNRESET за поездку в Китае) — вторая попытка
    // обычно добивает, а дублем это не станет (сервер дедупит по хэшу)
    const uploadOne = async (it: BatchItem, idx: number): Promise<void> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (stopRef.current) throw new Error("stopped");
        try {
          const fd = new FormData();
          const f = it.uploadFile ?? it.origin;
          fd.append("file", f, f.name?.trim() || `photo-${it.key}.jpg`);
          fd.append("dayId", dayOf(it));
          if (it.exifCoords) {
            fd.append("lat", String(it.exifCoords.lat));
            fd.append("lng", String(it.exifCoords.lng));
          }
          if (it.exifTakenAt) fd.append("takenAt", it.exifTakenAt.toISOString());
          if (it.hash) fd.append("contentHash", it.hash);
          const remaining = run.length - idx - 1;
          if (remaining > 0) fd.append("suppressPush", "1");
          else if (run.length > 1) fd.append("count", String(run.length));
          await upload.mutateAsync(fd);
          return;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Ошибка сети";
          // дедуп/лимит — ретрай бессмысленен
          if (msg.includes("уже загружено") || msg.includes("лимит") || attempt === 1) throw new Error(msg);
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    };

    // Пул из 2 параллельных загрузок: вдвое быстрее на мобильной сети,
    // но без шторма соединений; курсор idx общий
    let idx = 0;
    let stopped = false;
    const worker = async (slot: number) => {
      while (true) {
        if (stopRef.current) { stopped = true; return; }
        const i = idx;
        if (i >= run.length) return;
        idx++;
        const it = run[i];
        setItems((prev) =>
          prev.map((x) => (x.key === it.key ? { ...x, status: "uploading" } : x))
        );
        try {
          await uploadOne(it, i);
          ok++;
          setItems((prev) =>
            prev.map((x) =>
              x.key === it.key
                ? { ...x, status: "done" as const, errorMessage: undefined }
                : x
            )
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Ошибка сети";
          if (msg === "stopped") { stopped = true; return; }
          err++;
          lastError = msg;
          setItems((prev) =>
            prev.map((x) =>
              x.key === it.key ? { ...x, status: "error", errorMessage: msg } : x
            )
          );
        }
        void slot;
      }
    };
    // suppressPush: последний УШЕДШИЙ в очередь кадр несёт count — при пуле
    // «последний по idx» может прийти не последним по сети; допустимо: пуш
    // «добавил N фото» останется одним на батч, порядок кадров не важен
    await Promise.all([worker(1), worker(2)]);

    setRunning(false);
    setPhotoBatchRunning(false);
    if (stopped && ok + err < run.length) {
      toast.info(`Остановлено: загружено ${ok}`);
    } else if (err) {
      toast.error(`Не загрузилось ${err} из ${run.length} — ${lastError}`, {
        description: "Нажмите «Повторить» — загруженные кадры не задвоятся",
        duration: 8000,
      });
    } else {
      toast.success(`Загружено ${ok} фото 📸`);
      setTimeout(onDone, 700);
    }
    // Одна инвалидация на весь батч вместо 46 (шторм рефетчей давал лаги)
    void refetchPhotosAfterBatch();
  };

  // Один рефетч галереи/маршрута после батча (см. useUploadPhoto invalidate:false)
  const refetchPhotosAfterBatch = () => {
    qc.invalidateQueries({ queryKey: ["photos"] });
    qc.invalidateQueries({ queryKey: ["photos-geo"] });
    invalidateRouteData(qc);
  };

  const removeItem = (key: string) => {
    setItems((prev) => {
      const it = prev.find((x) => x.key === key);
      if (it) URL.revokeObjectURL(it.preview);
      return prev.filter((x) => x.key !== key);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-medium">
          {items.length} фото
          {preparing && (
            <span className="text-muted-foreground font-normal">
              {" "}
              · обработано {processed}/{files.length}…
            </span>
          )}
        </div>
        {!running && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground min-h-8 px-1"
          >
            Отменить
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {items.map((it, i) => (
          <div
            key={it.key}
            style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}
            className={cn(
              "relative aspect-square rounded-lg overflow-hidden bg-muted animate-fade-up [animation-duration:280ms]",
              it.duplicate && "opacity-50"
            )}
          >
            <img src={it.preview} alt="" className="size-full object-cover" />
            {it.exifCoords && (
              <MapPin className="absolute top-1 left-1 size-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
            )}
            {dayNumber(dayOf(it)) != null && (
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
                Д{dayNumber(dayOf(it))}
              </span>
            )}
            {it.status === "done" && (
              <span className="absolute inset-0 grid place-items-center bg-emerald-950/50">
                <Check className="size-5 text-emerald-400" />
              </span>
            )}
            {(it.status === "preparing" || it.status === "uploading") && (
              <span className="absolute inset-0 grid place-items-center bg-black/40">
                <Loader2 className="size-5 animate-spin text-white" />
              </span>
            )}
            {it.status === "error" && (
              <span
                className="absolute inset-0 grid place-items-center bg-red-950/50"
                title={it.errorMessage || "Не загрузилось — попробуйте «Повторить»"}
              >
                <X className="size-5 text-red-400" />
              </span>
            )}
            {it.duplicate && (
              <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center text-[10px] font-medium text-white">
                уже в поездке
              </span>
            )}
            {!running && (it.status === "ready" || it.status === "error") && (
              <button
                type="button"
                onClick={() => removeItem(it.key)}
                aria-label="Убрать фото"
                className="absolute top-0.5 right-0.5 size-6 rounded-full bg-black/60 text-white grid place-items-center active:scale-90 transition-transform"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {noDateCount > 0 && !running && (
        <div className="rounded-xl border border-border p-2.5 space-y-2">
          <div className="text-xs text-muted-foreground">
            {noDateCount} фото без даты съёмки — положим в выбранный день:
          </div>
          <DayPicker value={fallbackDayId} onChange={setPickedDayId} />
        </div>
      )}

      {running && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>
              Загружено {uploadedInRun} из {queue.length}
            </span>
            <button
              type="button"
              onClick={() => {
                stopRef.current = true;
              }}
              className="inline-flex items-center gap-1 min-h-8 px-2 rounded-lg border border-border hover:bg-muted"
            >
              <Square className="size-3" /> Остановить
            </button>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${queue.length ? (uploadedInRun / queue.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {!running && (
        <StickySubmit>
          {failedCount > 0 && items.some((it) => it.status === "error" && it.uploadFile) ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onDone}
                className="rounded-xl border border-input bg-background py-3.5 text-sm font-medium min-h-[48px] active:scale-[0.98] transition-transform"
              >
                Готово
              </button>
              <button
                type="button"
                onClick={runUpload}
                disabled={preparing || !queue.length}
                className="rounded-xl bg-primary text-primary-foreground py-3.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px] active:scale-[0.98] transition-transform"
              >
                <RotateCcw className="size-4" />
                Повторить {queue.filter((it) => it.status !== "done").length}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={runUpload}
              disabled={preparing || !queue.length}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px] active:scale-[0.98] transition-transform"
            >
              {preparing ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Подготавливаем…
                </>
              ) : queue.length === 0 && duplicateCount > 0 ? (
                <>Все фото уже в поездке</>
              ) : (
                <>Загрузить {queue.length} фото</>
              )}
            </button>
          )}
        </StickySubmit>
      )}
    </div>
  );
}
