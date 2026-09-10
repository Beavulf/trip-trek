"use client";

import { motion } from "framer-motion";
import { ArrowRight, Plane, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTripId } from "@/hooks/use-trip";
import type { TripInfo, UserProfile } from "./types";

/** Статус поездки по календарю — честнее, чем поле status в БД */
function tripStatusChip(trip: TripInfo): { label: string; cls: string } {
  const now = new Date();
  const start = new Date(trip.startDate);
  const end = trip.endDate ? new Date(trip.endDate) : null;
  if (end && end < now) return { label: "Завершена", cls: "bg-muted text-muted-foreground" };
  if (start > now) return { label: "Планируется", cls: "bg-primary/10 text-primary" };
  return { label: "Идёт сейчас", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
}

function dateRange(trip: TripInfo): string {
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  const start = fmt(new Date(trip.startDate));
  if (!trip.endDate) return start;
  return `${start} – ${fmt(new Date(trip.endDate))}`;
}

interface TripsListProps {
  profile: UserProfile;
  onOpenTrip: (tripId: string) => void;
  onCreateTrip: () => void;
}

export function TripsList({ profile, onOpenTrip, onCreateTrip }: TripsListProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-2xl bg-card border border-border overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Plane className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">Мои поездки</h3>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {profile.limits?.maxOwnedTrips === null
            ? `${profile.trips.length} всего`
            : `создано ${profile.stats.ownedTrips}/${profile.limits?.maxOwnedTrips} · всего ${profile.trips.length}`}
        </span>
        <button
          type="button"
          onClick={onCreateTrip}
          className="size-8 -mr-1 rounded-lg bg-primary/10 text-primary grid place-items-center hover:bg-primary/20 transition-colors"
          aria-label="Создать поездку"
          title="Создать поездку"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="divide-y divide-border">
        {profile.trips.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-3xl mb-2">🧳</div>
            <p className="text-sm text-muted-foreground mb-3">Пока ни одной поездки</p>
            <button
              type="button"
              onClick={onCreateTrip}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground active:scale-[0.98] transition-transform"
            >
              <Plus className="size-4" /> Создать первую
            </button>
          </div>
        ) : (
          profile.trips.map((trip) => {
            const currentTripId = typeof window !== "undefined" ? getTripId() : "";
            const isCurrent = trip.id === currentTripId;
            const chip = tripStatusChip(trip);
            return (
              <button
                type="button"
                key={trip.id}
                onClick={() => onOpenTrip(trip.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-left transition-colors",
                  isCurrent ? "bg-primary/5" : "hover:bg-accent/50"
                )}
              >
                <div
                  className="size-12 rounded-xl grid place-items-center text-2xl shrink-0 shadow-sm border border-black/5"
                  style={{ background: trip.coverColor }}
                >
                  {trip.coverEmoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm truncate">{trip.title}</span>
                    {trip.role === "owner" && (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        своя
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {dateRange(trip)} · {trip.totalDays} дн · {trip.members} чел
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", chip.cls)}>
                      {chip.label}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        открытая
                      </span>
                    )}
                  </div>
                </div>
                {!isCurrent && <ArrowRight className="size-4 text-muted-foreground shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </motion.section>
  );
}
