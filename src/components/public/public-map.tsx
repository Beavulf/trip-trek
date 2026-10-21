"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { TILE_LAYERS } from "@/lib/map-layers";

// Карта публичной страницы: без императивного API и хендлов — просто точки.
// Места — крупные круги (посещённые ярче), фото — мелкий янтарный слой
// «где снимали». Light-слой ArcGIS: он доступнее OSM в Китае,
// где ссылку чаще всего и открывают из мессенджера.

export interface PublicMapPlace {
  name: string;
  lat: number;
  lng: number;
  visited: boolean;
}

/** Декларативный автозум: подгоняем охват под все точки после монтирования. */
function FitToPoints({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 11);
      return;
    }
    const lats = points.map((p) => p[0]);
    const lngs = points.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [28, 28], maxZoom: 12 }
    );
  }, [map, points]);
  return null;
}

export function PublicMap({
  places,
  photoPoints = [],
}: {
  places: PublicMapPlace[];
  photoPoints?: { lat: number; lng: number }[];
}) {
  const points = useMemo(() => places.filter((p) => p.lat && p.lng), [places]);
  // Подложка под тему страницы: гостям по умолчанию dark — светлая карта
  // была бы ярким пятном. Гость тему не переключает, выбора при монтировании достаточно.
  const [layer] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? TILE_LAYERS.dark
      : TILE_LAYERS.light
  );
  const allPoints = useMemo<[number, number][]>(
    () => [
      ...points.map((p) => [p.lat, p.lng] as [number, number]),
      ...photoPoints.map((p) => [p.lat, p.lng] as [number, number]),
    ],
    [points, photoPoints]
  );
  const center = useMemo(() => {
    if (!allPoints.length) return { lat: 48, lng: 15 };
    return {
      lat: allPoints.reduce((s, p) => s + p[0], 0) / allPoints.length,
      lng: allPoints.reduce((s, p) => s + p[1], 0) / allPoints.length,
    };
  }, [allPoints]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={allPoints.length > 1 ? 6 : 11}
      scrollWheelZoom={false}
      className="w-full h-[320px] rounded-2xl overflow-hidden z-0"
    >
      <TileLayer url={layer.url} attribution={layer.attr} />
      <FitToPoints points={allPoints} />
      {/* Фото — нижний слой: мелкие точки «здесь снимали» */}
      {photoPoints.map((p, i) => (
        <CircleMarker
          key={`photo-${i}`}
          center={[p.lat, p.lng]}
          radius={3.5}
          pathOptions={{
            color: "#ffffff",
            weight: 1,
            fillColor: "#f59e0b",
            fillOpacity: 0.8,
          }}
        >
          <Tooltip direction="top" offset={[0, -4]}>
            📷 Фото
          </Tooltip>
        </CircleMarker>
      ))}
      {points.map((p, i) => (
        <CircleMarker
          key={`${p.name}-${i}`}
          center={[p.lat, p.lng]}
          radius={p.visited ? 8 : 5}
          pathOptions={{
            color: "#ffffff",
            weight: 1.5,
            fillColor: p.visited ? "#10b981" : "#f97316",
            fillOpacity: p.visited ? 0.95 : 0.65,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            {p.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
