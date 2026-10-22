"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentTripId, useTrip } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { useUploadQueue } from "@/hooks/use-upload-queue";
import { Camera, Check, Images, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { ImageCompressError } from "@/lib/image-compress";
import { getUploadQueue } from "@/lib/upload-queue/browser";
import { prepareForUpload } from "@/lib/upload-queue/prepare";
import type { Prepared } from "@/lib/upload-queue/types";
import { DayPicker } from "./DayPicker";
import { PhotoBatch } from "./PhotoBatch";
import { StickySubmit } from "./StickySubmit";

type GeoStatus = "idle" | "requesting" | "granted" | "denied";
type GeoCoords = { lat: number; lng: number };

interface PhotoFormProps {
  onDone: () => void;
}

export function PhotoForm({ onDone }: PhotoFormProps) {
  const { data: trip } = useTrip();
  const tripId = useCurrentTripId();
  const { data: session } = useAuth();
  const userId = (session?.user as { id?: string } | undefined)?.id || "";
  const snap = useUploadQueue();
  // Невыбранный до конца выбор из галереи (в т.ч. восстановленный после закрытия приложения):
  // шит открывается сразу на нём, а не на пустых кнопках
  const stagedBatchId = useMemo(
    () => snap.jobs.find((j) => !j.committed && j.tripId === tripId)?.batchId ?? null,
    [snap.jobs, tripId]
  );
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Подготовленный кадр: сжатая копия + превью + EXIF + sha256 (одним проходом, как в очереди)
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [caption, setCaption] = useState("");
  const [dayId, setDayId] = useState("");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [geoCoords, setGeoCoords] = useState<GeoCoords | null>(null);
  const [geoAddress, setGeoAddress] = useState<string | null>(null);
  // Откуда взялись координаты: EXIF честнее устройства (вечерний батч из
  // галереи иначе получает гео отеля), источник виден пользователю в чипе
  const [geoSource, setGeoSource] = useState<"exif" | "device" | null>(null);
  // Сжатие фото — единственная тяжёлая часть пути; гео больше не блокирует
  // превью и submit (раньше спиннер висел до 8с в ожидании координат, аудит 2026-10-06)
  const [processing, setProcessing] = useState(false);
  // Кадр отдан очереди и шит уезжает вниз: пока идёт exit-анимация, показываем «готово»,
  // а не мигаем стартовым экраном с кнопками «Снять / Из галереи»
  const [closing, setClosing] = useState(false);
  const finish = () => {
    setClosing(true);
    onDone();
  };
  const geoPromiseRef = useRef<Promise<GeoCoords | null> | null>(null);
  const addressKeyRef = useRef<string | null>(null);

  // Sync day when trip loads (was stuck empty after open)
  useEffect(() => {
    if (!trip?.days?.length) return;
    if (dayId && trip.days.some((d) => d.id === dayId)) return;
    const today =
      trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ??
      trip.days[0]?.id ??
      "";
    setDayId(today);
  }, [trip, dayId]);

  // Гео запрашиваем сразу при открытии формы: пока юзер снимает фото,
  // разрешение уже получено и координаты готовы — местоположение подтягивается
  // «само», без ожидания поверх превью. Промис кэшируется, повторных запросов нет
  // (maximumAge сглаживает повторные монтирования формы).
  const requestGeo = (): Promise<GeoCoords | null> => {
    if (geoPromiseRef.current) return geoPromiseRef.current;
    if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
    setGeoStatus("requesting");
    const p = new Promise<GeoCoords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGeoCoords(coords);
          setGeoStatus("granted");
          setGeoSource((s) => s ?? "device");
          resolve(coords);
        },
        () => {
          setGeoStatus("denied");
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    });
    geoPromiseRef.current = p;
    return p;
  };

  useEffect(() => {
    void requestGeo();
  }, []);

  // Адрес — чисто косметика на карте, догружается в фоне один раз на точку
  useEffect(() => {
    if (geoStatus !== "granted" || !geoCoords) return;
    const key = `${geoCoords.lat.toFixed(5)},${geoCoords.lng.toFixed(5)}`;
    if (addressKeyRef.current === key) return;
    addressKeyRef.current = key;
    fetch(`/api/geocode?lat=${geoCoords.lat}&lng=${geoCoords.lng}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.address) setGeoAddress(data.address);
      })
      .catch(() => {
        // адрес опционален — координаты уже сохранятся
      });
  }, [geoStatus, geoCoords]);

  const onFile = async (f: File) => {
    setProcessing(true);
    try {
      // GPS и дата съёмки из EXIF точнее текущего положения — приоритетнее
      // устройства; сервер EXIF выпиливает, читаем здесь (см. lib/photo-exif)
      const p = await prepareForUpload(f);
      if (p.coords) {
        geoPromiseRef.current = Promise.resolve(p.coords);
        setGeoCoords(p.coords);
        setGeoStatus("granted");
        setGeoSource("exif");
        toast.success("📍 Координаты из фото");
      }

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const previewUrl = URL.createObjectURL(p.file);
      previewUrlRef.current = previewUrl;
      setPreview(previewUrl);
      setPrepared(p);
    } catch (e) {
      console.error("Photo processing error:", e);
      const msg =
        e instanceof ImageCompressError
          ? e.message
          : "Недостаточно памяти для обработки. Попробуйте фото меньшего размера или JPEG";
      toast.error(msg);
      clearPreview();
    } finally {
      setProcessing(false);
      // Allow re-selecting the same file
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  // Оптимистичная отправка: кадр уходит в фоновую очередь и шит закрывается сразу, не
  // дожидаясь ответа сервера. Сбой сети или закрытие приложения его не потеряют —
  // очередь хранится на устройстве и доотправит кадр сама
  const submit = async () => {
    if (!prepared || !dayId) {
      toast.error(!dayId ? "Выберите день" : "Выберите фото");
      return;
    }
    if (!userId || !tripId) {
      toast.error("Войдите, чтобы добавить фото");
      return;
    }
    const queue = getUploadQueue();
    if (queue.knows(tripId, prepared.hash)) {
      toast.info("Это фото уже в поездке");
      return;
    }
    setProcessing(true);
    // Гео стартовало при открытии формы и обычно уже готово; если ещё нет —
    // короткое окно ожидания, но не блокируем загрузку фото координатами
    let coords = geoCoords;
    if (!coords && (geoStatus === "requesting" || geoStatus === "idle")) {
      coords = await Promise.race([
        requestGeo(),
        new Promise<null>((r) => setTimeout(() => r(null), 2000)),
      ]);
    }
    queue.addPrepared({
      userId,
      tripId,
      dayId,
      name: `photo-${Date.now()}.jpg`,
      prepared: { ...prepared, coords: coords ?? prepared.coords },
      caption,
      address: coords && geoAddress ? geoAddress : null,
    });
    toast.success(
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "Фото сохранено — отправим, когда появится сеть"
        : "Фото добавлено 📸" + (coords ? " с геолокацией" : "")
    );
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPrepared(null);
    setPreview(null);
    setCaption("");
    setProcessing(false);
    finish();
  };

  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPrepared(null);
    setPreview(null);
    setGeoSource(null);
  };

  const busy = processing;

  if (closing) {
    return (
      <div className="py-10 flex flex-col items-center gap-2 text-sm text-muted-foreground" role="status">
        <Check className="size-8 text-emerald-500" aria-hidden="true" />
        Добавлено в очередь
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          // Мультивыбор: один файл — прежний одиночный флоу, пачка — батч
          const list = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!list.length) return;
          if (list.length === 1 && !stagedBatchId) void onFile(list[0]);
          else if (userId && tripId) {
            // Пачка (или дописывание в уже начатый выбор): подготовка стартует сразу, в фоне
            getUploadQueue().stage({ userId, tripId, files: list, batchId: stagedBatchId ?? undefined });
          }
        }}
      />

      {stagedBatchId ? (
        <PhotoBatch
          batchId={stagedBatchId}
          onDone={finish}
          onCancel={() => {}}
          onAddMore={() => galleryRef.current?.click()}
        />
      ) : (
        <>
          {preview ? (
            <div className="relative rounded-xl overflow-hidden border border-border">
              <img src={preview} alt="Выбранное фото" className="w-full max-h-60 object-cover" />
              {processing && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2 text-white">
                    <Loader2 className="size-8 animate-spin" />
                    <span className="text-xs">Сжимаем фото…</span>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={clearPreview}
                className="absolute top-2 right-2 size-9 rounded-full bg-black/60 text-white grid place-items-center z-10"
                aria-label="Убрать фото"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : processing ? (
            <div className="border-2 border-dashed border-primary/30 rounded-2xl py-10 flex flex-col items-center gap-2 text-primary bg-primary/5">
              <Loader2 className="size-8 animate-spin" />
              <span className="text-xs font-medium">Обрабатываем фото…</span>
            </div>
          ) : (
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 text-white text-base font-semibold shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2.5 transition-transform active:scale-[0.98]"
              >
                <Camera className="size-6" strokeWidth={2.2} />
                Снять фото
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="h-12 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Images className="size-5" />
                Из галереи
              </button>
            </div>
          )}

          {/* Статус гео — отдельной строкой под превью, не поверх фото */}
          {geoStatus === "requesting" && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
              <Loader2 className="size-3 animate-spin" /> Определяем местоположение…
            </div>
          )}
          {geoStatus === "granted" && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1 truncate">
              <MapPin className="size-3 shrink-0 text-emerald-500" />
              <span className="truncate">
                {geoSource === "exif"
                  ? `Из фото: ${geoAddress ? geoAddress.slice(0, 55) : "точка съёмки"}`
                  : geoAddress
                    ? geoAddress.slice(0, 60) + (geoAddress.length > 60 ? "…" : "")
                    : "Местоположение поймано"}
              </span>
            </div>
          )}
          {geoStatus === "denied" && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 px-1">
              <MapPin className="size-3 shrink-0" />
              Геолокация выключена — фото будет без метки на карте
            </div>
          )}

          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => {
              // Enter закрывает клавиатуру вместо отправки — подпись опциональна
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            enterKeyHint="done"
            placeholder="Подпись (необязательно)"
            maxLength={300}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile"
          />

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">День</label>
            <DayPicker value={dayId} onChange={setDayId} />
          </div>

          <StickySubmit>
            <button
              type="button"
              onClick={submit}
              disabled={!prepared || !dayId || busy}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px] transition-transform active:scale-[0.98]"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {processing ? "Обработка…" : "Добавить фото"}
            </button>
          </StickySubmit>
        </>
      )}
    </div>
  );
}
