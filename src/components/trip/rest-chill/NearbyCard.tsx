"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, MapPin, Navigation, Star } from "lucide-react";
import { type NearbyPlace } from "@/hooks/use-trip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { WishlistItem } from "./types";
import { loadWishlist, saveWishlist, wishlistDedupeKey, migrateLegacyWishlist } from "@/lib/wishlist";
import { useCurrentTripId } from "@/hooks/use-trip";

export function NearbyCard({ place }: { place: NearbyPlace }) {
  const [added, setAdded] = useState(false);
  const tripId = useCurrentTripId();

  const addToWishlist = () => {
    // P1 #6: единый helper load/save (раньше писали в LS напрямую)
    // P1 #5: ключ изолирован по tripId
    // Первая миграция legacy ключа при необходимости
    migrateLegacyWishlist(tripId);
    const items = loadWishlist(tripId);

    // P1 #13: дедуп по lat+lng+name (раньше по имени → коллизии)
    const dedupeKey = wishlistDedupeKey({
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      address: place.address ?? undefined,
    });
    if (items.some(i => wishlistDedupeKey(i) === dedupeKey)) {
      toast.info("Уже в списке");
      setAdded(true);
      return;
    }

    const newItem: WishlistItem = {
      id: crypto.randomUUID(),
      name: place.name,
      category: place.category === "restaurant" ? "restaurant" : place.category === "cafe" ? "cafe" : place.category === "bar" ? "bar" : "other",
      address: place.address || undefined,
      note: place.cuisine || undefined,
      visited: false,
      rating: null,
      lat: place.lat,
      lng: place.lng,
    };
    saveWishlist([newItem, ...items], tripId);
    setAdded(true);
    toast.success("Добавлено в «Хочу посетить» ⭐");
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-card border border-border p-3 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-2.5">
        <div className="size-10 rounded-xl grid place-items-center text-xl shrink-0 bg-amber-500/10">
          {place.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm leading-tight line-clamp-1">{place.name}</h3>
          {place.cuisine && (
            <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{place.cuisine}</div>
          )}
          {place.address && (
            <div className="flex items-start gap-1 text-[10px] text-muted-foreground mt-0.5">
              <MapPin className="size-2.5 mt-0.5 shrink-0" />
              <span className="line-clamp-1">{place.address}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-primary font-medium flex items-center gap-0.5">
              <Navigation className="size-2.5" /> {place.distance < 1000 ? `${place.distance} м` : `${(place.distance / 1000).toFixed(1)} км`}
            </span>
            <a
              href={`https://www.openstreetmap.org/directions?from=&to=${place.lat}%2C${place.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary hover:underline"
            >
              Как добраться
            </a>
          </div>
          {/* Кнопка добавить в "Хочу посетить" */}
          <button
            onClick={addToWishlist}
            disabled={added}
            aria-label={added ? "Уже в списке желаний" : "Добавить в список желаний"}
            className={cn(
              "mt-2 w-full min-h-11 rounded-lg py-1.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors",
              added
                ? "bg-green-500/10 text-green-600"
                : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 active:scale-95"
            )}
          >
            {added ? (
              <><CheckCircle2 className="size-3.5" /> В списке</>
            ) : (
              <><Star className="size-3.5" /> Хочу посетить</>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
