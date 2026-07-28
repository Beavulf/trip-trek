"use client";

import dynamic from "next/dynamic";
import { useTripStore } from "@/lib/trip-store";
import { AppShell } from "@/components/trip/app-shell";
import { Dashboard } from "@/components/trip/dashboard";
import { Timeline } from "@/components/trip/timeline";
import { Itinerary } from "@/components/trip/itinerary";
import { Gallery } from "@/components/trip/gallery";
import { Budget } from "@/components/trip/budget";
import { RestChill } from "@/components/trip/rest-chill";
import { Journal } from "@/components/trip/journal";
import { InfoPanel } from "@/components/trip/info-panel";
import { AISummary } from "@/components/trip/ai-summary";
import { Phrasebook } from "@/components/trip/phrasebook";
import { WeatherPanel } from "@/components/trip/weather-panel";
import { TransportMap } from "@/components/trip/transport-map";
import { FoodGuide } from "@/components/trip/food-guide";
import { Achievements } from "@/components/trip/achievements";
import { Board } from "@/components/trip/board";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// Leaflet работает только в браузере
const TripMap = dynamic(() => import("@/components/trip/trip-map"), {
  ssr: false,
  loading: () => <div className="py-20 text-center text-muted-foreground">Загрузка карты…</div>,
});

export default function Home() {
  const { activeTab } = useTripStore();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  // Проверка сессии через API
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => {
        if (!r.ok) throw new Error("session fetch failed");
        return r.json();
      })
      .then((data) => {
        if (data?.user) {
          setAuthenticated(true);
        } else {
          router.push("/login");
        }
        setAuthChecked(true);
      })
      .catch(() => {
        // На ошибке сети НЕ редиректим — возможно временный сбой
        // Показываем приложение, next-auth сам покажет логин при необходимости
        setAuthenticated(true);
        setAuthChecked(true);
      });
  }, [router]);

  if (!authChecked || !authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "timeline" && <Timeline />}
          {activeTab === "itinerary" && <Itinerary />}
          {activeTab === "map" && <TripMap />}
          {activeTab === "gallery" && <Gallery />}
          {activeTab === "budget" && <Budget />}
          {activeTab === "rest" && <RestChill />}
          {activeTab === "journal" && <Journal />}
          {activeTab === "ai" && <AISummary />}
          {activeTab === "food" && <FoodGuide />}
          {activeTab === "phrases" && <Phrasebook />}
          {activeTab === "weather" && <WeatherPanel />}
          {activeTab === "transport" && <TransportMap />}
          {activeTab === "board" && <Board />}
          {activeTab === "achievements" && <Achievements />}
          {activeTab === "info" && <InfoPanel />}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
