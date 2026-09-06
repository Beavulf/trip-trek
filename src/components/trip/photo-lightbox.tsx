"use client";

import { Lightbox } from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { MapPin, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Photo } from "@/lib/types";

interface PhotoLightboxProps {
  open: boolean;
  index: number;
  photos: Photo[];
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onMapClick: (photo: Photo) => void;
  onDelete: (photoId: string) => void;
  canDelete: (photo: Photo) => boolean;
  pendingDelete: boolean;
}

export function PhotoLightbox({
  open,
  index,
  photos,
  onIndexChange,
  onClose,
  onMapClick,
  onDelete,
  canDelete,
  pendingDelete,
}: PhotoLightboxProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const slides = photos.map((p) => ({
    src: p.url,
    alt: p.caption ?? "Фото",
    // Captions plugin reads `title` (top) and `description` (bottom).
    title: p.caption ?? undefined,
    description: (
      <div className="flex items-center gap-3 text-xs opacity-80 flex-wrap">
        {p.day && <span>День {p.day.dayNumber}</span>}
        {p.day?.city && <span>{p.day.city}</span>}
        {p.user && <span>{p.user.name}</span>}
        {p.address && <span className="block w-full mt-0.5 opacity-70">{p.address}</span>}
      </div>
    ),
  }));

  const current = photos[index];
  const hasMapTarget =
    !!current && (!!current.placeId || (current.lat != null && current.lng != null));
  const showDelete = !!current && canDelete(current);

  const MapButton = (
    <button
      key="map"
      type="button"
      disabled={!hasMapTarget}
      onClick={(e) => {
        e.stopPropagation();
        if (current && hasMapTarget) onMapClick(current);
      }}
      className={cn(
        "yarl__button",
        "size-11 rounded-full grid place-items-center text-white",
        "bg-white/10 hover:bg-white/20 active:scale-90 transition-transform",
        !hasMapTarget && "opacity-30 pointer-events-none",
      )}
      aria-label="Открыть на карте"
      title="Открыть на карте"
    >
      <MapPin className="size-5" />
    </button>
  );

  const DeleteButton = !showDelete
    ? null
    : confirmDeleteId === current!.id
      ? (
        <div key="delete" className="flex items-center gap-1">
          <button
            type="button"
            disabled={pendingDelete}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(current!.id);
            }}
            className="yarl__button btn-confirm-yes"
          >
            {pendingDelete ? "…" : "Удалить"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDeleteId(null);
            }}
            className="yarl__button btn-confirm-no bg-white/15 text-white"
          >
            Отмена
          </button>
        </div>
      )
      : (
        <button
          key="delete"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDeleteId(current!.id);
          }}
          className="yarl__button size-11 rounded-full grid place-items-center text-white bg-white/10 hover:bg-red-500/80 active:scale-90 transition-transform"
          aria-label="Удалить фото"
          title="Удалить фото"
        >
          <Trash2 className="size-5" />
        </button>
      );

  return (
    <Lightbox
      open={open}
      index={index}
      close={onClose}
      on={{
        view: ({ index: i }) => onIndexChange(i),
        click: () => setConfirmDeleteId(null),
      }}
      slides={slides}
      plugins={[Captions, Zoom]}
      carousel={{ finite: false, preload: 1 }}
      controller={{ closeOnBackdropClick: true }}
      captions={{ showToggle: false }}
      zoom={{ scrollToZoom: true, pinchZoomV4: true }}
      toolbar={{
        buttons: [MapButton, DeleteButton, "close"],
      }}
    />
  );
}
