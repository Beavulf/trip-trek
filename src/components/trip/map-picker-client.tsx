"use client";

// CSS Leaflet едет вместе с этим чанком (см. trip-map.tsx)
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import { TILE_LAYERS } from "@/lib/map-layers";

function makePickerIcon() {
  return L.divIcon({
    className: "trip-map-picker-pin",
    html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:#f97316;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

export default function PickerClient({
  pos,
  setPos,
}: {
  pos: { lat: number; lng: number };
  setPos: (p: { lat: number; lng: number }) => void;
}) {
  const [icon, setIcon] = useState<L.DivIcon | null>(null);
  useEffect(() => {
    setIcon(makePickerIcon());
  }, []);

  return (
    <MapContainer
      center={[pos.lat, pos.lng]}
      zoom={15}
      className="w-full h-full"
      zoomControl={true}
    >
      <TileLayer
        // Общая подложка из lib/map-layers — раньше пикер держал свой CARTO-ключ
        url={TILE_LAYERS.voyager.url}
        attribution={TILE_LAYERS.voyager.attr}
      />
      <PickerMarker pos={pos} setPos={setPos} icon={icon} />
      <RecenterOn pos={pos} />
    </MapContainer>
  );
}

function PickerMarker({
  pos,
  setPos,
  icon,
}: {
  pos: { lat: number; lng: number };
  setPos: (p: { lat: number; lng: number }) => void;
  icon: L.DivIcon | null;
}) {
  useMapEvents({
    click(e) {
      setPos({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  if (!icon) return null;
  return (
    <Marker
      position={[pos.lat, pos.lng]}
      icon={icon}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const ll = e.target.getLatLng();
          setPos({ lat: ll.lat, lng: ll.lng });
        },
      }}
    />
  );
}

function RecenterOn({ pos }: { pos: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.panTo([pos.lat, pos.lng]);
  }, [pos.lat, pos.lng, map]);
  return null;
}
