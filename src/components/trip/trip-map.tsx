"use client";

import { useDays, useUpdatePlace, getTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { CATEGORY_META, CITIES, type Place, type Day, type Photo } from "@/lib/types";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, MapPin, Star, Coffee, Filter, Navigation, Plus, Hand, Moon, Sun, Camera, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AddPlaceSheet, type AddPlaceData } from "./add-place-sheet";

// Кастомный пин
function makeIcon(category: string, status: string, emoji: string) {
  let color = "#94a3b8"; // planned — серый
  if (status === "visited") color = "#22c55e";
  else if (status === "current") color = "#f97316";
  const pulse = status === "current" ? "trip-pin-current" : "";
  return L.divIcon({
    className: `trip-pin ${pulse}`,
    html: `<div class="trip-pin-pin" style="background:${color}"><span>${emoji}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

// Фото-пин (маленький круглый с миниатюрой)
function makePhotoIcon(thumbUrl: string) {
  return L.divIcon({
    className: "trip-photo-pin",
    html: `<div style="
      width:40px;height:40px;border-radius:50%;overflow:hidden;
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);
      background:#000;
    "><img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;" /></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

export default function TripMap() {
  const { data: days, isLoading } = useDays();
  const { mapCityFilter, setMapCityFilter, mapOnlyUnvisited, setMapOnlyUnvisited, mapOnlyChill, setMapOnlyChill } = useTripStore();
  const [addMode, setAddMode] = useState(false);
  const [addData, setAddData] = useState<AddPlaceData | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [autoTheme, setAutoTheme] = useState(true);
  const [manualLayer, setManualLayer] = useState<"voyager" | "satellite" | "light" | "dark">("voyager");
  const [showPhotos, setShowPhotos] = useState(true);
  const [onlyPhotos, setOnlyPhotos] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<Photo | null>(null);
  const { resolvedTheme } = useTheme();

  // Фото с геолокацией для карты (только текущая поездка)
  const { data: geoPhotos } = useQuery<Photo[]>({
    queryKey: ["photos-geo", getTripId()],
    queryFn: async () => {
      const r = await fetch(`/api/photos/geo?tripId=${getTripId()}`);
      return r.json();
    },
  });

  // Автоматический выбор слоя по теме
  const tileLayer = autoTheme
    ? resolvedTheme === "dark" ? "dark" : "voyager"
    : manualLayer;

  const TILE_LAYERS = {
    voyager: {
      url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      attr: "&copy; OpenStreetMap &copy; CARTO",
    },
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attr: "&copy; Esri",
    },
    light: {
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      attr: "&copy; OpenStreetMap &copy; CARTO",
    },
    dark: {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      attr: "&copy; OpenStreetMap &copy; CARTO",
    },
  };

  const allPlaces = useMemo(() => {
    if (!days) return [];
    return days.flatMap((d) => d.places.map((p) => ({ place: p, day: d })));
  }, [days]);

  const filtered = useMemo(() => {
    let res = allPlaces;
    if (mapCityFilter) res = res.filter((x) => x.day.cityKey === mapCityFilter);
    if (mapOnlyUnvisited) res = res.filter((x) => x.place.status !== "visited");
    if (mapOnlyChill) res = res.filter((x) => ["cafe", "bar", "restaurant"].includes(x.place.category));
    return res;
  }, [allPlaces, mapCityFilter, mapOnlyUnvisited, mapOnlyChill]);

  // Центр карты по выбранному городу или общий
  const center = mapCityFilter
    ? CITIES.find((c) => c.key === mapCityFilter)!
    : { lat: 22.8, lng: 113.9, name: "China" }; // между городами

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Загрузка карты…</div>;

  const handleMapClick = (lat: number, lng: number) => {
    if (!addMode) return;
    const dayForPlace = mapCityFilter
      ? days?.find((d) => d.cityKey === mapCityFilter)?.id
      : days?.[0]?.id;
    setAddData({ lat, lng, dayId: dayForPlace });
    setAddOpen(true);
    setAddMode(false);
  };

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Подсказка режима добавления */}
      {addMode && (
        <div className="rounded-2xl bg-primary/10 border border-primary/30 p-3 flex items-center gap-2 text-sm">
          <Hand className="size-4 text-primary animate-pulse" />
          <span className="text-primary font-medium">Тапните по карте, чтобы добавить место</span>
          <button
            onClick={() => setAddMode(false)}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
          >
            Отмена
          </button>
        </div>
      )}

      {/* Фильтры */}
      <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="size-3.5" /> Фильтры
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setMapCityFilter(null)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              !mapCityFilter ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"
            )}
          >
            Все города
          </button>
          {CITIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setMapCityFilter(c.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors",
                mapCityFilter === c.key ? "text-white" : "bg-secondary hover:bg-accent"
              )}
              style={mapCityFilter === c.key ? { background: c.color } : undefined}
            >
              <span className="size-1.5 rounded-full" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setMapOnlyUnvisited(!mapOnlyUnvisited)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              mapOnlyUnvisited ? "bg-primary/10 text-primary border border-primary/30" : "bg-secondary hover:bg-accent"
            )}
          >
            <Circle className="size-3" /> Непосещённые
          </button>
          <button
            onClick={() => setMapOnlyChill(!mapOnlyChill)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              mapOnlyChill ? "bg-amber-500/10 text-amber-600 border border-amber-500/30" : "bg-secondary hover:bg-accent"
            )}
          >
            <Coffee className="size-3" /> Кафе и бары
          </button>
          <button
            onClick={() => setShowPhotos((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              showPhotos ? "bg-cyan-500/10 text-cyan-600 border border-cyan-500/30" : "bg-secondary hover:bg-accent"
            )}
          >
            <Camera className="size-3" /> Фото {geoPhotos?.length ? `(${geoPhotos.length})` : ""}
          </button>
          {showPhotos && geoPhotos && geoPhotos.length > 0 && (
            <button
              onClick={() => setOnlyPhotos((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                onlyPhotos ? "bg-cyan-500 text-white" : "bg-secondary hover:bg-accent text-muted-foreground"
              )}
            >
              {onlyPhotos ? "📍 Только фото" : "Только фото"}
            </button>
          )}
          <button
            onClick={() => setAddMode(!addMode)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ml-auto",
              addMode ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"
            )}
          >
            {addMode ? <Hand className="size-3" /> : <Plus className="size-3" />}
            {addMode ? "Тапайте по карте" : "Добавить место"}
          </button>
        </div>
      </div>

      {/* Легенда */}
      <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-muted-foreground px-1 flex-wrap">
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-slate-400" /> Запланировано</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-orange-500" /> Сейчас здесь</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-green-500" /> Посещено</span>
        {showPhotos && geoPhotos && geoPhotos.length > 0 && (
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-full border-2 border-white bg-cyan-500" /> Фото</span>
        )}
        <span className="ml-auto">{filtered.length} мест{geoPhotos && geoPhotos.length > 0 ? ` · ${geoPhotos.length} фото` : ""}</span>
      </div>

      {/* Карта */}
      <div className={cn(
        "rounded-2xl overflow-hidden border h-[55vh] min-h-[380px] relative",
        addMode ? "border-primary ring-2 ring-primary/30" : "border-border"
      )}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={mapCityFilter ? 12 : 8}
          scrollWheelZoom={false}
          className="w-full h-full"
          key={mapCityFilter || "all"}
        >
          <TileLayer
            key={tileLayer}
            attribution={TILE_LAYERS[tileLayer].attr}
            url={TILE_LAYERS[tileLayer].url}
          />
          <FlyTo center={center} />
          {addMode && <MapClickHandler onClick={handleMapClick} />}
          {/* Места — скрываются в режиме "Только фото" */}
          {!onlyPhotos && filtered.map(({ place, day }) => (
            <Marker
              key={place.id}
              position={[place.lat, place.lng]}
              icon={makeIcon(place.category, place.status, CATEGORY_META[place.category]?.emoji ?? "📍")}
            >
              <Popup>
                <PlacePopup place={place} day={day} />
              </Popup>
            </Marker>
          ))}
          {/* Фото-метки (отдельная группа) */}
          {showPhotos && geoPhotos?.map((photo) => (
            photo.lat && photo.lng && (
              <Marker
                key={`photo-${photo.id}`}
                position={[photo.lat, photo.lng]}
                icon={makePhotoIcon(photo.thumbUrl || photo.url)}
              >
                <Popup>
                  <div className="p-1 w-48">
                    <img src={photo.url} alt={photo.caption || ""} className="w-full h-32 object-cover rounded-lg mb-1.5" />
                    {photo.caption && <div className="text-xs font-medium">{photo.caption}</div>}
                    {photo.address && (
                      <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                        <MapPin className="size-2.5" /> {photo.address.slice(0, 50)}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {photo.user?.emoji} {photo.user?.name} · День {photo.day?.dayNumber}
                    </div>
                    <button
                      onClick={() => setFullscreenPhoto(photo)}
                      className="mt-1.5 w-full text-[10px] font-medium bg-primary/10 text-primary rounded-lg py-1 hover:bg-primary/20 transition-colors"
                    >
                      📷 Открыть на весь экран
                    </button>
                  </div>
                </Popup>
              </Marker>
            )
          ))}
        </MapContainer>
        {addMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[500] bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
            👆 Тапните по карте
          </div>
        )}
        {/* Переключатель слоёв карты */}
        <div className="absolute top-2 right-2 z-[500] flex flex-col gap-1 bg-card/90 backdrop-blur rounded-lg p-1 shadow-lg">
          {/* Auto — по теме */}
          <button
            onClick={() => setAutoTheme(true)}
            title="Авто (по теме)"
            className={cn(
              "size-9 rounded-md text-base grid place-items-center transition-colors",
              autoTheme ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {resolvedTheme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </button>
          {/* Ручные слои */}
          {([
            { key: "voyager", label: "🗺️", title: "Подробная" },
            { key: "satellite", label: "🛰️", title: "Спутник" },
            { key: "dark", label: "🌙", title: "Тёмная" },
            { key: "light", label: "⚪", title: "Светлая" },
          ] as const).map((l) => (
            <button
              key={l.key}
              onClick={() => { setAutoTheme(false); setManualLayer(l.key); }}
              title={l.title}
              className={cn(
                "size-9 rounded-md text-base grid place-items-center transition-colors",
                !autoTheme && tileLayer === l.key ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Инфо о картах */}
      <p className="text-[10px] text-muted-foreground px-1 leading-relaxed">
        🗺️ Карты: OpenStreetMap (CARTO/Esri) — работают в Китае без VPN. Все метки сохранены.
        Для лучшей навигации в Китае рекомендуем Amap (高德地图) или Baidu Maps как отдельное приложение.
      </p>

      <AddPlaceSheet open={addOpen} onOpenChange={setAddOpen} initial={addData} />

      {/* Полноэкранный просмотр фото */}
      {fullscreenPhoto && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[300] bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setFullscreenPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 size-10 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20 z-10"
            onClick={() => setFullscreenPhoto(null)}
          >
            <X className="size-5" />
          </button>
          <img
            src={fullscreenPhoto.url}
            alt={fullscreenPhoto.caption || ""}
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="mt-4 text-center max-w-md">
            {fullscreenPhoto.caption && <div className="text-white font-medium text-sm">{fullscreenPhoto.caption}</div>}
            {fullscreenPhoto.address && (
              <div className="text-white/60 text-xs mt-1 flex items-center justify-center gap-1">
                <MapPin className="size-3" /> {fullscreenPhoto.address}
              </div>
            )}
            <div className="text-white/50 text-xs mt-1">
              {fullscreenPhoto.user?.emoji} {fullscreenPhoto.user?.name} · День {fullscreenPhoto.day?.dayNumber}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Компонент для перехвата кликов по карте
function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([center.lat, center.lng], map.getZoom(), { duration: 0.8 });
  }, [center.lat, center.lng, map]);
  return null;
}

function PlacePopup({ place, day }: { place: Place; day: Day }) {
  const update = useUpdatePlace();
  const meta = CATEGORY_META[place.category];
  const visited = place.status === "visited";

  return (
    <div className="p-1 w-52 font-sans">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{meta?.emoji}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${meta?.color}22`, color: meta?.color }}>
          {meta?.label}
        </span>
      </div>
      <div className="font-semibold text-sm leading-tight">{place.name}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
        <MapPin className="size-2.5" /> День {day.dayNumber} · {day.city}
      </div>
      {place.description && (
        <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{place.description}</p>
      )}
      <div className="flex items-center gap-2 mt-2 text-[11px]">
        {place.budget ? <span className="text-muted-foreground">${place.budget}</span> : null}
        {place.rating ? (
          <span className="flex items-center gap-0.5 text-amber-500">
            <Star className="size-2.5 fill-current" /> {place.rating}
          </span>
        ) : null}
      </div>
      <button
        onClick={() => {
          update.mutate({ id: place.id, status: visited ? "planned" : "visited" });
          toast(visited ? "Снято" : "Посещено 🎉", { description: place.name });
        }}
        className={cn(
          "mt-2 w-full rounded-lg py-1.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors",
          visited ? "bg-green-500/10 text-green-600" : "bg-primary text-primary-foreground"
        )}
      >
        {visited ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
        {visited ? "Посещено" : "Отметить"}
      </button>
    </div>
  );
}
