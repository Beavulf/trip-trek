"use client";

import dynamic from "next/dynamic";
import { useTripStore } from "@/lib/trip-store";
import { AppShell } from "@/components/trip/app-shell";
import { Dashboard } from "@/components/trip/dashboard";
import { Itinerary } from "@/components/trip/itinerary";
import { Gallery } from "@/components/trip/gallery";
import { Budget } from "@/components/trip/budget";
import { RestChill } from "@/components/trip/rest-chill";
import { Journal } from "@/components/trip/journal";
import { InfoPanel } from "@/components/trip/info-panel";
import { AISummary } from "@/components/trip/ai-summary";
import { Phrasebook } from "@/components/trip/phrasebook";
import { WeatherPanel } from "@/components/trip/weather-panel";
import { AnimatePresence, motion } from "framer-motion";

// Leaflet работает только в браузере
const TripMap = dynamic(() => import("@/components/trip/trip-map"), {
  ssr: false,
  loading: () => <div className="py-20 text-center text-muted-foreground">Загрузка карты…</div>,
});

export default function Home() {
  const { activeTab } = useTripStore();

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "itinerary" && <Itinerary />}
          {activeTab === "map" && <TripMap />}
          {activeTab === "gallery" && <Gallery />}
          {activeTab === "budget" && <Budget />}
          {activeTab === "rest" && <RestChill />}
          {activeTab === "journal" && <Journal />}
          {activeTab === "ai" && <AISummary />}
          {activeTab === "phrases" && <Phrasebook />}
          {activeTab === "weather" && <WeatherPanel />}
          {activeTab === "info" && <InfoPanel />}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
