"use client";

import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

/** Shared mobile bottom sheet — same pattern as AddPlaceSheet. */
export function MobileBottomSheet({
  open,
  onOpenChange,
  title,
  titleIcon,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  titleIcon?: ReactNode;
  children: ReactNode;
}) {
  useBodyScrollLock(open);
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="sheet-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto flex flex-col pb-[env(safe-area-inset-bottom)]"
        >
          <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 sm:px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="font-bold text-base sm:text-lg flex items-center gap-2">
              {titleIcon}
              {title}
            </h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="size-10 rounded-full hover:bg-accent grid place-items-center"
              aria-label="Закрыть"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="px-4 sm:px-5 py-4">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
