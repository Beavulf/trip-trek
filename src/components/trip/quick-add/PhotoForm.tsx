"use client";

import { useEffect, useRef, useState } from "react";
import { useTrip, useUploadPhoto } from "@/hooks/use-trip";
import { Camera, Check, Images, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import exifr from "exifr";
import { compressImageForUpload, ImageCompressError } from "@/lib/image-compress";
import { DayPicker } from "./DayPicker";
import { StickySubmit } from "./StickySubmit";

type GeoStatus = "idle" | "requesting" | "granted" | "denied";
type GeoCoords = { lat: number; lng: number };

interface PhotoFormProps {
  onDone: () => void;
}

export function PhotoForm({ onDone }: PhotoFormProps) {
  const { data: trip } = useTrip();
  const upload = useUploadPhoto();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [dayId, setDayId] = useState("");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [geoCoords, setGeoCoords] = useState<GeoCoords | null>(null);
  const [geoAddress, setGeoAddress] = useState<string | null>(null);
  // Сжатие фото — единственная тяжёлая часть пути; гео больше не блокирует
  // превью и submit (раньше спиннер висел до 8с в ожидании координат, аудит 2026-10-06)
  const [processing, setProcessing] = useState(false);
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
      // GPS из EXIF точнее текущего положения — приоритетнее устройства
      try {
        const exif = await exifr.gps(f);
        if (exif?.latitude != null && exif?.longitude != null) {
          const exifCoords = { lat: exif.latitude, lng: exif.longitude };
          geoPromiseRef.current = Promise.resolve(exifCoords);
          setGeoCoords(exifCoords);
          setGeoStatus("granted");
          toast.success("📍 Координаты из фото");
        }
      } catch {
        // EXIF optional
      }

      const compressed = await compressImageForUpload(f);

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const previewUrl = URL.createObjectURL(compressed);
      previewUrlRef.current = previewUrl;
      setPreview(previewUrl);
      setFile(compressed);
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

  const submit = async () => {
    if (!file || !dayId) {
      toast.error(!dayId ? "Выберите день" : "Выберите фото");
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
    const fd = new FormData();
    // Explicit filename — some mobile browsers send empty name for camera captures
    const uploadName = file.name?.trim() || `photo-${Date.now()}.jpg`;
    fd.append("file", file, uploadName);
    fd.append("dayId", dayId);
    if (caption) fd.append("caption", caption);
    if (coords) {
      fd.append("lat", String(coords.lat));
      fd.append("lng", String(coords.lng));
      if (geoAddress) fd.append("address", geoAddress);
    }
    try {
      await upload.mutateAsync(fd);
      toast.success("Фото добавлено 📸" + (coords ? " с геолокацией" : ""));
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setFile(null);
      setPreview(null);
      setCaption("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить фото");
    } finally {
      setProcessing(false);
    }
  };

  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setFile(null);
    setPreview(null);
  };

  const busy = upload.isPending || processing;

  return (
    <div className="space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />

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
            {geoAddress ? geoAddress.slice(0, 60) + (geoAddress.length > 60 ? "…" : "") : "Местоположение поймано"}
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
          disabled={!file || !dayId || busy}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px] transition-transform active:scale-[0.98]"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {upload.isPending ? "Загрузка…" : processing ? "Обработка…" : "Добавить фото"}
        </button>
      </StickySubmit>
    </div>
  );
}
