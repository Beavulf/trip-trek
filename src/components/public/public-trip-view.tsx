"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Camera, MapPin, X } from "lucide-react";

// Листлет тянет осязаемый CSS/JS — на публичную страницу только по требованию
const PublicMap = dynamic(() => import("./public-map").then((m) => m.PublicMap), {
  ssr: false,
  loading: () => <div className="w-full h-[320px] rounded-2xl bg-muted animate-pulse" />,
});

export interface PublicTrip {
  title: string;
  destination: string;
  emoji: string;
  accent: string;
  startDate: string;
  endDate: string | null;
  totalDays: number;
  days: {
    dayNumber: number;
    city: string;
    title: string;
    places: { name: string; category: string; lat: number; lng: number; visited: boolean }[];
  }[];
  photos: { url: string; thumbUrl: string; caption: string | null; dayNumber: number | null }[];
}

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "") : "";

export function PublicTripView({ trip }: { trip: PublicTrip }) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  const dateLabel =
    trip.endDate && trip.endDate !== trip.startDate
      ? `${fmt(trip.startDate)} — ${fmt(trip.endDate)}`
      : fmt(trip.startDate) || "скоро в путь";

  const cities = useMemo(() => {
    const seen: string[] = [];
    for (const d of trip.days) if (!seen.includes(d.city)) seen.push(d.city);
    return seen;
  }, [trip.days]);

  const allPlaces = useMemo(() => trip.days.flatMap((d) => d.places), [trip.days]);
  const visitedCount = allPlaces.filter((p) => p.visited).length;

  const photo = lightbox != null ? trip.photos[lightbox] : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Шапка */}
      <header
        className="px-4 pt-10 pb-6"
        style={{ background: `linear-gradient(160deg, ${trip.accent}22, transparent 70%)` }}
      >
        <div className="max-w-2xl mx-auto space-y-2">
          <div className="text-5xl" aria-hidden>
            {trip.emoji}
          </div>
          <h1 className="text-2xl font-bold leading-tight">{trip.title}</h1>
          <p className="text-sm text-muted-foreground">
            {dateLabel} · {trip.totalDays} дней · {cities.join(" → ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {visitedCount} из {allPlaces.length} мест посещено · {trip.photos.length} фото
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-16 space-y-8">
        {/* Карта */}
        {allPlaces.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <MapPin className="size-3.5" /> Карта путешествия
            </h2>
            <PublicMap places={allPlaces} />
          </section>
        )}

        {/* Маршрут по дням */}
        {trip.days.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Маршрут по дням
            </h2>
            <div className="space-y-2">
              {trip.days.map((d) => (
                <div key={d.dayNumber} className="rounded-2xl border border-border bg-card p-3.5">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-[11px] font-bold tabular-nums rounded-lg px-1.5 py-0.5"
                      style={{ background: `${trip.accent}22`, color: trip.accent }}
                    >
                      Д{d.dayNumber}
                    </span>
                    <span className="text-sm font-medium">{d.city}</span>
                    {d.title && <span className="text-xs text-muted-foreground truncate">· {d.title}</span>}
                  </div>
                  {d.places.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {d.places.map((p, i) => (
                        <span
                          key={`${p.name}-${i}`}
                          className={
                            p.visited
                              ? "text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600"
                              : "text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground"
                          }
                        >
                          {p.visited ? "✓ " : ""}
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Галерея */}
        {trip.photos.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Camera className="size-3.5" /> Фото ({trip.photos.length})
            </h2>
            <div className="grid grid-cols-3 gap-1.5">
              {trip.photos.map((p, i) => (
                <button
                  key={p.url + i}
                  type="button"
                  onClick={() => setLightbox(i)}
                  className="aspect-square rounded-xl overflow-hidden bg-muted active:scale-[0.97] transition-transform"
                  aria-label={p.caption ?? "Фото поездки"}
                >
                  {/* /uploads живут вне next/image — оптимизатор их не видит */}
                  <img src={p.thumbUrl} alt={p.caption ?? ""} loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          </section>
        )}

        <footer className="pt-4 text-center text-[11px] text-muted-foreground">
          Живёт в <b>TripTrek</b> — приложении для совместных путешествий
        </footer>
      </div>

      {/* Лайтбокс */}
      {photo && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >

          <img
            src={photo.url}
            alt={photo.caption ?? ""}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          {photo.caption && (
            <p className="mt-3 text-sm text-white/90 text-center max-w-md">{photo.caption}</p>
          )}
          {photo.dayNumber != null && (
            <p className="mt-1 text-xs text-white/50">День {photo.dayNumber}</p>
          )}
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Закрыть"
            className="absolute top-4 right-4 size-11 rounded-full bg-white/10 text-white grid place-items-center"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </main>
  );
}
