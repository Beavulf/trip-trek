"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { TILE_LAYERS } from "@/lib/map-layers";

// Карта публичной страницы: без императивного API и хендлов — просто точки
// мест, посещённые ярче. Light-слой ArcGIS: он доступнее OSM в Китае,
// где ссылку чаще всего и открывают из мессенджера.

export interface PublicMapPlace {
  name: string;
  lat: number;
  lng: number;
  visited: boolean;
}

export function PublicMap({ places }: { places: PublicMapPlace[] }) {
  const points = useMemo(() => places.filter((p) => p.lat && p.lng), [places]);
  const center = useMemo(() => {
    if (!points.length) return { lat: 48, lng: 15 };
    return {
      lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
      lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
    };
  }, [points]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={points.length > 1 ? 6 : 11}
      scrollWheelZoom={false}
      className="w-full h-[320px] rounded-2xl overflow-hidden z-0"
    >
      <TileLayer url={TILE_LAYERS.light.url} attribution={TILE_LAYERS.light.attr} />
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
