"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, MapPin, X, Navigation } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useGeocode } from "@/hooks/use-trip";
import dynamic from "next/dynamic";

// Загружаем react-leaflet только на клиенте, чтобы избежать SSR-краша
const PickerClient = dynamic(() => import("./map-picker-client"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 grid place-items-center bg-muted">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

export interface MapPickerResult {
  lat: number;
  lng: number;
  address: string;
}

export function MapPicker({
  open,
  onOpenChange,
  initialLat,
  initialLng,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialLat: number;
  initialLng: number;
  onPick: (result: MapPickerResult) => void;
}) {
  useBodyScrollLock(open);
  const [pos, setPos] = useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng,
  });
  const geocode = useGeocode();

  useEffect(() => {
    if (open) {
      setPos({ lat: initialLat, lng: initialLng });
    }
  }, [open, initialLat, initialLng]);

  if (!open || typeof document === "undefined") return null;

  const handleConfirm = async () => {
    try {
      const res = await geocode.mutateAsync({ lat: pos.lat, lng: pos.lng });
      onPick({ lat: pos.lat, lng: pos.lng, address: res.address });
      onOpenChange(false);
    } catch {
      onPick({
        lat: pos.lat,
        lng: pos.lng,
        address: `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`,
      });
      onOpenChange(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] bg-background flex flex-col"
      >
        {/* header */}
        <div className="shrink-0 px-4 py-3 border-b border-border flex items-center justify-between bg-card">
          <h2 className="font-bold text-base flex items-center gap-2">
            <MapPin className="size-5 text-primary" /> Выбрать место
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="size-11 rounded-full hover:bg-accent grid place-items-center"
            aria-label="Закрыть"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* map (client-only) */}
        <div className="relative flex-1 min-h-0">
          <PickerClient pos={pos} setPos={setPos} />
          {/* hint */}
          <div className="absolute top-3 left-3 right-3 z-[400] pointer-events-none">
            <div className="rounded-2xl bg-card/95 backdrop-blur border border-border px-3 py-2 text-xs flex items-center gap-2 shadow-md">
              <Navigation className="size-3.5 text-primary shrink-0" />
              <span>Тапните по карте, чтобы переместить метку</span>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="shrink-0 p-3 border-t border-border bg-card space-y-2">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate font-mono">
              {pos.lat.toFixed(4)}, {pos.lng.toFixed(4)}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-lg bg-secondary py-3 text-sm font-medium"
            >
              Отмена
            </button>
            <button
              onClick={handleConfirm}
              disabled={geocode.isPending}
              className="flex-1 rounded-lg bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {geocode.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {geocode.isPending ? "Определяем адрес…" : "Подтвердить"}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
