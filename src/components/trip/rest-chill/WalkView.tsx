"use client";

import { useState } from "react";
import { Check, Footprints, Loader2, Locate, MapPin, RotateCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CATEGORY_META } from "@/lib/types";
import { timeSlotFromHour } from "@/lib/time-of-day";
import { useRouteDays, useTrip } from "@/hooks/use-trip";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { AiDisclaimer } from "../ai-disclaimer";
import { useAiWalk, useCreatePlacesBatch, type WalkStop } from "@/hooks/trip/use-ai-planner";
import type { GeoState } from "./types";
import { cachedGeo } from "./types";

// Прогулка на ближайшие часы: реальные POI OpenStreetMap в радиусе (минус то,
// что уже в поездке), ИИ собирает таймлайн. Остановки добавляются в текущий
// день по одной — прогулка не мусорит в маршруте сама.

const HOURS = [2, 3, 4];
// Радиус выбирает юзер: сервер подсказывает «увеличь радиус», значит контрол
// обязан существовать. Дефолт 2 км — комфортный максимум пешей прогулки.
const RADII = [
  { m: 1000, label: "1 км" },
  { m: 2000, label: "2 км" },
  { m: 3000, label: "3 км" },
  { m: 5000, label: "5 км" },
];

export function WalkView({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: trip } = useTrip();
  const { data: days } = useRouteDays();
  const walk = useAiWalk();
  const batch = useCreatePlacesBatch();

  const [geo, setGeo] = useState<GeoState>(cachedGeo.value);
  const [hours, setHours] = useState(3);
  const [radius, setRadius] = useState(2000);
  const [prefs, setPrefs] = useState("");
  const [result, setResult] = useState<{ title: string | null; stops: WalkStop[]; note?: string } | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  // Рендер-синхронизация при открытии (паттерн SettingsTab) — сброс прошлой прогулки
  const [synced, setSynced] = useState<string | null>(null);
  const syncKey = open ? "open" : null;
  if (synced !== syncKey) {
    setSynced(syncKey);
    if (open) {
      setResult(null);
      setAdded(new Set());
      setPrefs("");
      setHours(3);
      setRadius(2000);
      setGeo(cachedGeo.value);
    }
  }

  const requestGeo = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      toast.error("Включите геолокацию для прогулки рядом");
      return;
    }
    setGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: GeoState = { status: "ready", lat: pos.coords.latitude, lng: pos.coords.longitude };
        cachedGeo.value = next;
        setGeo(next);
      },
      () => {
        setGeo({ status: "denied", message: "Нужна геолокация, чтобы найти места рядом" });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  const startLabel = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const run = async () => {
    if (geo.status !== "ready") return;
    try {
      const res = await walk.mutateAsync({ lat: geo.lat, lng: geo.lng, radiusM: radius, hours, startLabel: startLabel() });
      setResult(res);
      setAdded(new Set());
      if (res.stops.length === 0 && res.note) toast(res.note);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось собрать прогулку");
    }
  };

  // Текущий день маршрута: остановки добавляем туда (fallback — первый день)
  const currentDay = days?.find((d) => d.dayNumber === trip?.currentDayNumber) ?? days?.[0];

  const addToTrip = async (stop: WalkStop) => {
    if (!currentDay) {
      toast.error("Сначала добавьте день в маршрут");
      return;
    }
    try {
      await batch.mutateAsync([
        {
          dayId: currentDay.id,
          name: stop.name,
          category: stop.category,
          lat: stop.lat,
          lng: stop.lng,
          // Слот из времени остановки: иначе место падает в «Без времени»,
          // хотя ИИ уже раскладывал таймлайн по часам
          timeOfDay: stop.startLabel ? timeSlotFromHour(parseInt(stop.startLabel, 10)) : null,
          description: stop.why,
          address: stop.address,
        },
      ]);
      setAdded((prev) => new Set(prev).add(stop.name));
      toast.success(`«${stop.name}» → день ${currentDay.dayNumber}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось добавить остановку");
    }
  };

  return (
    <MobileBottomSheet open={open} onOpenChange={(v) => !v && onClose()} title="Прогулка рядом" titleIcon={<Footprints className="size-4" />}>
      <div className="space-y-3">
        {geo.status !== "ready" ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-4 text-center space-y-2">
            <Locate className="size-6 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {geo.status === "denied" ? geo.message : "Определим, где вы, и найдём места в пешей доступности"}
            </p>
            <button
              type="button"
              onClick={requestGeo}
              disabled={geo.status === "loading"}
              className="min-h-11 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 text-sm font-medium active:scale-95 transition-transform disabled:opacity-50"
            >
              {geo.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Locate className="size-4" />}
              Определить местоположение
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground shrink-0">На</span>
              <div role="radiogroup" aria-label="Длительность прогулки" className="flex-1 grid grid-cols-3 gap-1 p-1 bg-card border border-border rounded-xl">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={hours === h}
                    onClick={() => setHours(h)}
                    className={cn(
                      "min-h-9 rounded-lg text-xs font-medium transition-all",
                      hours === h ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {h} ч
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground shrink-0">В</span>
              <div role="radiogroup" aria-label="Радиус поиска мест" className="flex-1 grid grid-cols-4 gap-1 p-1 bg-card border border-border rounded-xl">
                {RADII.map((r) => (
                  <button
                    key={r.m}
                    type="button"
                    role="radio"
                    aria-checked={radius === r.m}
                    onClick={() => setRadius(r.m)}
                    className={cn(
                      "min-h-9 rounded-lg text-xs font-medium transition-all",
                      radius === r.m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <input
              value={prefs}
              onChange={(e) => setPrefs(e.target.value)}
              maxLength={200}
              placeholder="Настроение: хочется зелени и кофе… (необязательно)"
              className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm input-mobile"
              aria-label="Пожелания к прогулке"
            />

            <button
              type="button"
              onClick={run}
              disabled={walk.isPending}
              className="w-full min-h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {walk.isPending ? <Loader2 className="size-4 animate-spin" /> : result ? <RotateCw className="size-4" /> : <Sparkles className="size-4" />}
              {walk.isPending ? "Собираем прогулку…" : result ? "Другая прогулка" : `Собрать прогулку на ${hours} ч`}
            </button>

            {result && result.stops.length > 0 && (
              <div className="rounded-2xl border border-border p-3 space-y-3">
                <p className="text-sm font-bold flex items-center gap-1.5">
                  <Footprints className="size-4 text-[#d946ef]" aria-hidden /> {result.title ?? "Прогулка"}
                </p>
                <div className="relative">
                  <div className="absolute left-[5px] top-2 bottom-2 w-0.5 rounded-full bg-border" aria-hidden />
                  <div className="space-y-3">
                    {result.stops.map((s) => (
                      <div key={`${s.name}:${s.lat}`} className="relative pl-5">
                        <span className="absolute left-0 top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-card" aria-hidden />
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
                          {s.startLabel && <span>{s.startLabel}</span>}
                          {s.walkMin > 1 && <span>· ~{s.walkMin} мин пути</span>}
                        </div>
                        <div className="flex items-start gap-2 mt-0.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug">
                              {CATEGORY_META[s.category]?.emoji ?? "📍"} {s.name}
                            </p>
                            {s.why && <p className="text-xs text-muted-foreground leading-snug mt-0.5">{s.why}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => addToTrip(s)}
                            disabled={added.has(s.name) || batch.isPending || !currentDay}
                            className={cn(
                              "shrink-0 min-h-9 inline-flex items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium transition-colors",
                              added.has(s.name)
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-secondary border border-border hover:bg-accent"
                            )}
                          >
                            {added.has(s.name) ? (
                              <>
                                <Check className="size-3" /> В маршруте
                              </>
                            ) : (
                              <>
                                <MapPin className="size-3" /> В маршрут
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {currentDay && (
                  <p className="text-[10px] text-muted-foreground px-1">
                    Остановки добавляются в день {currentDay.dayNumber} ({currentDay.city})
                  </p>
                )}
              </div>
            )}

            {result && result.stops.length === 0 && result.note && (
              <p className="text-xs text-muted-foreground">{result.note}</p>
            )}

            <AiDisclaimer />
          </>
        )}
      </div>
    </MobileBottomSheet>
  );
}
