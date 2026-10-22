"use client";

import { memo } from "react";
import { ImageIcon } from "lucide-react";

import { thumbUrlFor } from "@/lib/upload-queue/browser";

/**
 * Превью задания очереди. Это маленькая (~240px) копия, а не оригинал: сетка из сотни
 * кадров с полноразмерными object URL съедала память телефона и валила вкладку.
 */
export const UploadThumb = memo(function UploadThumb({ id, hasThumb }: { id: string; hasThumb: boolean }) {
  const url = hasThumb ? thumbUrlFor(id) : null;
  if (!url) {
    return (
      <div className="size-full grid place-items-center bg-muted text-muted-foreground" aria-hidden="true">
        <ImageIcon className="size-4 opacity-50" />
      </div>
    );
  }
  return <img src={url} alt="" className="size-full object-cover" decoding="async" draggable={false} />;
});
