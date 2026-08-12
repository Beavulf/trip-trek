"use client";

import { motion } from "framer-motion";
import { ArrowRight, Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTripId } from "@/hooks/use-trip";
import type { UserProfile } from "./types";

interface TripsListProps {
  profile: UserProfile;
  onOpenTrip: (tripId: string) => void;
  onCreateTrip: () => void;
}

export function TripsList({ profile, onOpenTrip, onCreateTrip }: TripsListProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-2xl bg-card border border-border overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Plane className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">Мои поездки</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {profile.limits?.maxOwnedTrips === null
            ? `${profile.trips.length} всего`
            : `создано ${profile.stats.ownedTrips}/${profile.limits?.maxOwnedTrips} · всего ${profile.trips.length}`}
        </span>
      </div>
      <div className="divide-y divide-border">
        {profile.trips.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">У вас пока нет поездок</p>
            <button
              onClick={onCreateTrip}
              className="text-sm text-primary font-medium"
            >
              Создать первую →
            </button>
          </div>
        ) : (
          profile.trips.map((trip) => {
            const currentTripId = typeof window !== "undefined" ? getTripId() : "";
            const isCurrent = trip.id === currentTripId;
            return (
              <button
                key={trip.id}
                onClick={() => onOpenTrip(trip.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-left transition-colors",
                  isCurrent ? "bg-primary/5" : "hover:bg-accent/50"
                )}
              >
                <div
                  className="size-11 rounded-xl grid place-items-center text-2xl shrink-0 shadow-sm"
                  style={{ background: trip.coverColor }}
                >
                  {trip.coverEmoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{trip.title}</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                    <span>{new Date(trip.startDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
                    <span>·</span>
                    <span>{trip.totalDays} дн</span>
                    <span>·</span>
                    <span>{trip.members} чел</span>
                    {trip.role === "owner" && <span className="text-primary font-medium">· создатель</span>}
                  </div>
                </div>
                {isCurrent ? (
                  <div className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                    текущая
                  </div>
                ) : (
                  <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
