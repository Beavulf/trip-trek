"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useTrip, useUploadPhoto, useAddExpense, useAddJournal } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { EXPENSE_CATEGORIES, type Day } from "@/lib/types";
import { Camera, Wallet, BookOpen, Loader2, Check, X, Images, MapPin } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { useAuth as useSession } from "@/hooks/use-auth";
import { toast } from "sonner";
import { motion } from "framer-motion";
import exifr from "exifr";
import { cn } from "@/lib/utils";

type Mode = "photo" | "expense" | "journal";

export function QuickAddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("photo");
  const { data: trip } = useTrip();
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id || trip?.settings.currentUserId || "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus /> Быстрое добавление
          </SheetTitle>
          <SheetDescription>
            {trip ? `День ${trip.currentDayNumber} · ${trip.days.find(d => d.dayNumber === trip.currentDayNumber)?.city ?? ""}` : ""}
          </SheetDescription>
        </SheetHeader>

        {/* Выбор режима */}
        <div className="grid grid-cols-3 gap-2.5 mt-4">
          {([
            { key: "photo", label: "Фото", icon: Camera, color: "#06b6d4" },
            { key: "expense", label: "Трата", icon: Wallet, color: "#10b981" },
            { key: "journal", label: "Заметка", icon: BookOpen, color: "#8b5cf6" },
          ] as const).map((m) => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={cn(
                  "relative flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all overflow-hidden active:scale-95",
                  active
                    ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/10"
                    : "border-border text-muted-foreground hover:bg-accent hover:border-primary/20"
                )}
              >
                {active && (
                  <div
                    className="absolute -top-3 -right-3 size-12 rounded-full opacity-15 blur-lg"
                    style={{ background: m.color }}
                  />
                )}
                <div
                  className="relative size-10 rounded-xl grid place-items-center transition-transform"
                  style={{
                    background: active ? `${m.color}22` : "transparent",
                    transform: active ? "scale(1.1)" : "scale(1)",
                  }}
                >
                  <Icon className="size-6" strokeWidth={2} style={{ color: active ? m.color : undefined }} />
                </div>
                <span className="relative text-sm font-medium">{m.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          {mode === "photo" && <PhotoForm userId={userId} onDone={() => onOpenChange(false)} />}
          {mode === "expense" && <ExpenseForm userId={userId} onDone={() => onOpenChange(false)} />}
          {mode === "journal" && <JournalForm userId={userId} onDone={() => onOpenChange(false)} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Plus() {
  return null;
}

function DayPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: trip } = useTrip();
  if (!trip) return null;
  const currentDay = trip.days.find((d) => d.dayNumber === trip.currentDayNumber);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
    >
      {trip.days.map((d: Day) => (
        <option key={d.id} value={d.id}>
          День {d.dayNumber} · {d.city} — {d.title}
        </option>
      ))}
    </select>
  );
}

function PhotoForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { data: trip } = useTrip();
  const upload = useUploadPhoto();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [dayId, setDayId] = useState(trip?.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ?? "");
  const [geoStatus, setGeoStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
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
        // Пропорционально уменьшаем
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
        resolve(originalFile); // Fallback на оригинал
      };
      img.src = url;
    });
  };

  const onFile = async (f: File) => {
    setProcessing(true);
    try {
      // 0. Проверка размера (макс 25MB)
      if (f.size > 25 * 1024 * 1024) {
        toast.error("Фото слишком большое (макс 25MB)");
        setProcessing(false);
        return;
      }

      // 1. Читаем EXIF из ОРИГИНАЛЬНОГО файла (до сжатия)
      // Используем gps: true для быстрого парсинга только GPS (меньше памяти)
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
            // Reverse geocode
            try {
              const r = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
              const data = await r.json();
              if (data.address) setGeoAddress(data.address);
            } catch {
              // ignore
            }
          }
          // Дата съёмки
          if (exif.DateTimeOriginal) {
            takenAt = new Date(exif.DateTimeOriginal);
          }
        }
      } catch {
        // EXIF нет или не читается — не критично
      }

      // 2. Сжимаем фото (мобильные камеры дают 4000x3000+ = 8MB+)
      const compressed = await compressImage(f);

      // 3. Создаём preview (из сжатого файла — меньше памяти)
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const previewUrl = URL.createObjectURL(compressed);
      previewUrlRef.current = previewUrl;
      setPreview(previewUrl);
      setFile(compressed);

      // 4. Если EXIF GPS нет — запрашиваем текущую геолокацию
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
    // Если геолокация ещё не запрашивалась — запросим
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
      // Cleanup
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
            onClick={() => {
              if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
              previewUrlRef.current = null;
              setFile(null);
              setPreview(null);
              setGeoCoords(null);
              setGeoAddress(null);
              setGeoStatus("idle");
            }}
            className="absolute top-2 right-2 size-7 rounded-full bg-black/60 text-white grid place-items-center z-10"
          >
            <X className="size-4" />
          </button>
          {/* Индикатор геолокации */}
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

function ExpenseForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { data: trip } = useTrip();
  const addExpense = useAddExpense();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [dayId, setDayId] = useState(trip?.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ?? "");

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || !description) {
      toast.error("Укажите сумму и описание");
      return;
    }
    await addExpense.mutateAsync({
      amount: amt,
      category,
      description,
      paidById: userId,
      dayId,
    });
    toast.success("Трата добавлена 💸");
    setAmount("");
    setDescription("");
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <DayPicker value={dayId} onChange={setDayId} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Сумма ($)</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>
      </div>

      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Описание (например, Ужин в SoHo)"
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />

      <button
        onClick={submit}
        disabled={addExpense.isPending}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {addExpense.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Добавить трату
      </button>
    </div>
  );
}

function JournalForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { data: trip } = useTrip();
  const addJournal = useAddJournal();
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("😊");
  const [dayId, setDayId] = useState(trip?.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ?? "");

  const moods = ["😊", "🤩", "😴", "🤤", "🥳", "🤔", "😍", "😰"];

  const submit = async () => {
    if (!content.trim()) {
      toast.error("Напишите что-нибудь");
      return;
    }
    await addJournal.mutateAsync({
      dayId,
      content,
      mood,
      userId,
    });
    toast.success("Запись добавлена в дневник 📔");
    setContent("");
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <DayPicker value={dayId} onChange={setDayId} />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Настроение</label>
        <div className="flex gap-1 flex-wrap">
          {moods.map((m) => (
            <button
              key={m}
              onClick={() => setMood(m)}
              className={cn(
                "size-10 rounded-lg text-xl grid place-items-center transition-all",
                mood === m ? "bg-primary/20 ring-2 ring-primary scale-110" : "bg-muted hover:bg-accent"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Что запомнилось сегодня?"
        rows={4}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
      />

      <button
        onClick={submit}
        disabled={addJournal.isPending}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {addJournal.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Сохранить запись
      </button>
    </div>
  );
}
