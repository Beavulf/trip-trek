"use client";

import dynamic from "next/dynamic";
import { useTripStore } from "@/lib/trip-store";
import { AppShell } from "@/components/trip/app-shell";
import { Dashboard } from "@/components/trip/dashboard";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// Leaflet работает только в браузере
const TripMap = dynamic(() => import("@/components/trip/trip-map"), {
  ssr: false,
  loading: () => <div className="py-20 text-center text-muted-foreground">Загрузка карты…</div>,
});

// Плейсхолдер на время загрузки чанка вкладки (ленивые импорты ниже).
const TabLoader = () => (
  <div className="py-16 flex justify-center">
    <Loader2 className="size-6 animate-spin text-muted-foreground" />
  </div>
);

// Обзор — статически: это вкладка по умолчанию, её чанк нужен к первому кадру
// (иначе лоадер→контент на холодном кэше даёт layout shift), а гости сюда не попадают
// (middleware уводит их на /login до загрузки бандла).
// Каждая прочая вкладка — отдельный чанк: на старте не тащим ~500 KiB неиспользуемого JS.
const Timeline = dynamic(() => import("@/components/trip/timeline").then(m => m.Timeline), { loading: TabLoader });
const Itinerary = dynamic(() => import("@/components/trip/itinerary").then(m => m.Itinerary), { loading: TabLoader });
const Gallery = dynamic(() => import("@/components/trip/gallery").then(m => m.Gallery), { loading: TabLoader });
const Budget = dynamic(() => import("@/components/trip/budget").then(m => m.Budget), { loading: TabLoader });
const RestChill = dynamic(() => import("@/components/trip/rest-chill").then(m => m.RestChill), { loading: TabLoader });
const Journal = dynamic(() => import("@/components/trip/journal").then(m => m.Journal), { loading: TabLoader });
const InfoPanel = dynamic(() => import("@/components/trip/info-panel").then(m => m.InfoPanel), { loading: TabLoader });
const AISummary = dynamic(() => import("@/components/trip/ai-summary").then(m => m.AISummary), { loading: TabLoader });
const Phrasebook = dynamic(() => import("@/components/trip/phrasebook").then(m => m.Phrasebook), { loading: TabLoader });
const WeatherPanel = dynamic(() => import("@/components/trip/weather-panel").then(m => m.WeatherPanel), { loading: TabLoader });
const FoodGuide = dynamic(() => import("@/components/trip/food-guide").then(m => m.FoodGuide), { loading: TabLoader });
const Achievements = dynamic(() => import("@/components/trip/achievements").then(m => m.Achievements), { loading: TabLoader });
const Board = dynamic(() => import("@/components/trip/board").then(m => m.Board), { loading: TabLoader });

export default function Home() {
  const { activeTab } = useTripStore();
  const router = useRouter();
  const { data: session, status } = useAuth();

  // Редирект только в useEffect (не во время рендера!)
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Пока грузится — показываем спиннер
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        </div>
      </div>
    );
  }

  // Не авторизован — показываем спиннер (useEffect выше сделает редирект)
  if (status === "unauthenticated" || !session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Перенаправление…</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      {/* Без AnimatePresence mode="wait": при быстрых переключениях вкладок exit-анимация
          тяжёлой вкладки (карта/галерея) может застрять и заблокировать появление новой.
          Оставляем только enter-анимацию — key меняет контент мгновенно. */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
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
          {activeTab === "board" && <Board />}
          {activeTab === "achievements" && <Achievements />}
          {activeTab === "info" && <InfoPanel />}
      </motion.div>
    </AppShell>
  );
}
