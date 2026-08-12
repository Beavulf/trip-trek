"use client";

import { useEffect, useRef, useState } from "react";
import { useTrip, useUploadPhoto } from "@/hooks/use-trip";
import { Camera, Check, Images, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import exifr from "exifr";
import { cn } from "@/lib/utils";
import { DayPicker } from "./DayPicker";

type GeoStatus = "idle" | "requesting" | "granted" | "denied";

interface PhotoFormProps {
  userId: string;
  onDone: () => void;
}

export function PhotoForm({ userId, onDone }: PhotoFormProps) {
  const { data: trip } = useTrip();
  const upload = useUploadPhoto();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [dayId, setDayId] = useState(trip?.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ?? "");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoAddress, setGeoAddress] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const requestGeo = async (): Promise<{ lat: number; lng: number } | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return null;
    }
    setGeoStatus("requesting");
    return new Promise((resolve) => {
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
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  // Сжатие фото через Canvas (мобильные фото могут быть 5-10MB)
  const compressImage = (originalFile: File, maxWidth = 1920, quality = 0.8): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(originalFile);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(originalFile);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressed = new File([blob], originalFile.name.replace(/\.[^.]+$/, ".jpg"), {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressed);
            } else {
              resolve(originalFile);
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(originalFile);
      };
      img.src = url;
    });
  };

  const onFile = async (f: File) => {
    setProcessing(true);
    try {
      if (f.size > 25 * 1024 * 1024) {
        toast.error("Фото слишком большое (макс 25MB)");
        setProcessing(false);
        return;
      }

      let exifCoords: { lat: number; lng: number } | null = null;
      let takenAt: Date | null = null;
      try {
        const exif = await exifr.parse(f, { gps: true });
        if (exif) {
          const lat = exif.latitude ?? exif.GPSLatitude;
          const lng = exif.longitude ?? exif.GPSLongitude;
          if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
            exifCoords = { lat, lng };
            setGeoCoords(exifCoords);
            setGeoStatus("granted");
            toast.success("📍 Координаты из фото", { description: "GPS найден в EXIF" });
            try {
              const r = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
              const data = await r.json();
              if (data.address) setGeoAddress(data.address);
            } catch {
              // ignore
            }
          }
          if (exif.DateTimeOriginal) {
            takenAt = new Date(exif.DateTimeOriginal);
          }
        }
      } catch {
        // EXIF нет или не читается — не критично
      }
      void takenAt;

      const compressed = await compressImage(f);

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const previewUrl = URL.createObjectURL(compressed);
      previewUrlRef.current = previewUrl;
      setPreview(previewUrl);
      setFile(compressed);

      if (!exifCoords) {
        toast.info("📍 В фото нет GPS, запрашиваем текущую геолокацию…", {
          description: "Разрешите доступ к геолокации",
          duration: 3000,
        });
        const coords = await requestGeo();
        if (coords) {
          try {
            const r = await fetch(`/api/geocode?lat=${coords.lat}&lng=${coords.lng}`);
            const data = await r.json();
            if (data.address) setGeoAddress(data.address);
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      console.error("Photo processing error:", e);
      toast.error("Не удалось обработать фото");
    } finally {
      setProcessing(false);
    }
  };

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const submit = async () => {
    if (!file || !dayId) return;
    setProcessing(true);
    let coords = geoCoords;
    if (!coords && geoStatus === "idle") {
      coords = await requestGeo();
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dayId", dayId);
    fd.append("userId", userId);
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
      setGeoCoords(null);
      setGeoAddress(null);
      setGeoStatus("idle");
      onDone();
    } catch {
      toast.error("Не удалось загрузить фото");
    } finally {
      setProcessing(false);
    }
  };

  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setFile(null);
    setPreview(null);
    setGeoCoords(null);
    setGeoAddress(null);
    setGeoStatus("idle");
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <DayPicker value={dayId} onChange={setDayId} />
      </div>

      {/* Скрытые input'ы: камера и галерея */}
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
          <img src={preview} alt="preview" className="w-full max-h-60 object-cover" />
          {processing && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-white">
                <Loader2 className="size-8 animate-spin" />
                <span className="text-xs">Обработка фото…</span>
              </div>
            </div>
          )}
          <button
            onClick={clearPreview}
            className="absolute top-2 right-2 size-7 rounded-full bg-black/60 text-white grid place-items-center z-10"
          >
            <X className="size-4" />
          </button>
          {geoStatus === "granted" && geoAddress && (
            <div className="absolute bottom-2 left-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-lg flex items-center gap-1">
              📍 {geoAddress.slice(0, 50)}{geoAddress.length > 50 ? "…" : ""}
            </div>
          )}
          {geoStatus === "granted" && !geoAddress && geoCoords && (
            <div className="absolute bottom-2 left-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-lg flex items-center gap-1">
              📍 {geoCoords.lat.toFixed(4)}, {geoCoords.lng.toFixed(4)}
            </div>
          )}
          {geoStatus === "denied" && (
            <div className="absolute bottom-2 left-2 right-2 bg-amber-500/80 text-white text-[10px] px-2 py-1 rounded-lg">
              📍 Геолокация отключена — фото без метки на карте
            </div>
          )}
        </div>
      ) : processing ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="border-2 border-dashed border-primary/30 rounded-2xl py-8 flex flex-col items-center gap-2 text-primary bg-primary/5">
            <Loader2 className="size-8 animate-spin" />
            <span className="text-xs font-medium">Обработка…</span>
          </div>
          <div className="border-2 border-dashed border-primary/30 rounded-2xl py-8 flex flex-col items-center gap-2 text-primary bg-primary/5">
            <Loader2 className="size-8 animate-spin" />
            <span className="text-xs font-medium">Обработка…</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {/* Снять фото */}
          <button
            onClick={() => cameraRef.current?.click()}
            className="border-2 border-dashed border-border rounded-2xl py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Camera className="size-8" />
            <span className="text-xs font-medium">Снять фото</span>
          </button>
          {/* Из галереи */}
          <button
            onClick={() => galleryRef.current?.click()}
            className="border-2 border-dashed border-border rounded-2xl py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Images className="size-8" />
            <span className="text-xs font-medium">Из галереи</span>
          </button>
        </div>
      )}

      {/* Статус геолокации при выборе */}
      {geoStatus === "requesting" && (
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="size-3 animate-spin" /> Определяем местоположение…
        </div>
      )}
      {geoStatus === "granted" && geoAddress && (
        <div className="text-[11px] text-green-600 flex items-center gap-1">
          📍 Адрес определён: {geoAddress.slice(0, 60)}{geoAddress.length > 60 ? "…" : ""}
        </div>
      )}

      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Подпись (необязательно)"
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />

      <button
        onClick={submit}
        disabled={!file || upload.isPending || processing}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {upload.isPending || processing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {upload.isPending ? "Загрузка…" : processing ? "Обработка…" : "Добавить фото"}
      </button>
    </div>
  );
}
