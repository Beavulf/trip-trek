"use client";

import { useEffect, useRef, useState } from "react";
import { useTrip, useUploadPhoto } from "@/hooks/use-trip";
import { Camera, Check, Images, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import exifr from "exifr";
import { compressImageForUpload, ImageCompressError } from "@/lib/image-compress";
import { DayPicker } from "./DayPicker";

type GeoStatus = "idle" | "requesting" | "granted" | "denied";

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
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoAddress, setGeoAddress] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

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
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    });
  };

  const onFile = async (f: File) => {
    setProcessing(true);
    try {
      let exifCoords: { lat: number; lng: number } | null = null;
      try {
        // Parse only GPS — lighter than full EXIF dump
        const exif = await exifr.gps(f);
        if (exif?.latitude != null && exif?.longitude != null) {
          exifCoords = { lat: exif.latitude, lng: exif.longitude };
          setGeoCoords(exifCoords);
          setGeoStatus("granted");
          toast.success("📍 Координаты из фото");
          try {
            const r = await fetch(`/api/geocode?lat=${exifCoords.lat}&lng=${exifCoords.lng}`);
            const data = await r.json();
            if (data.address) setGeoAddress(data.address);
          } catch {
            // ignore
          }
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

      if (!exifCoords) {
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
    let coords = geoCoords;
    if (!coords && geoStatus === "idle") {
      coords = await requestGeo();
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
      setGeoCoords(null);
      setGeoAddress(null);
      setGeoStatus("idle");
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
            type="button"
            onClick={clearPreview}
            className="absolute top-2 right-2 size-9 rounded-full bg-black/60 text-white grid place-items-center z-10"
          >
            <X className="size-4" />
          </button>
          {geoStatus === "granted" && geoAddress && (
            <div className="absolute bottom-2 left-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-lg">
              📍 {geoAddress.slice(0, 50)}
              {geoAddress.length > 50 ? "…" : ""}
            </div>
          )}
          {geoStatus === "denied" && (
            <div className="absolute bottom-2 left-2 right-2 bg-amber-500/80 text-white text-[10px] px-2 py-1 rounded-lg">
              📍 Геолокация отключена — фото без метки на карте
            </div>
          )}
        </div>
      ) : processing ? (
        <div className="border-2 border-dashed border-primary/30 rounded-2xl py-10 flex flex-col items-center gap-2 text-primary bg-primary/5">
          <Loader2 className="size-8 animate-spin" />
          <span className="text-xs font-medium">Сжимаем фото…</span>
          <span className="text-[10px] text-muted-foreground">это экономит память на телефоне</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="border-2 border-dashed border-border rounded-2xl py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors min-h-[44px]"
          >
            <Camera className="size-8" />
            <span className="text-xs font-medium">Снять фото</span>
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="border-2 border-dashed border-border rounded-2xl py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors min-h-[44px]"
          >
            <Images className="size-8" />
            <span className="text-xs font-medium">Из галереи</span>
          </button>
        </div>
      )}

      {geoStatus === "requesting" && (
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="size-3 animate-spin" /> Определяем местоположение…
        </div>
      )}

      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Подпись (необязательно)"
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base input-mobile"
      />

      <button
        type="button"
        onClick={submit}
        disabled={!file || !dayId || upload.isPending || processing}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
      >
        {upload.isPending || processing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {upload.isPending ? "Загрузка…" : processing ? "Обработка…" : "Добавить фото"}
      </button>
    </div>
  );
}
