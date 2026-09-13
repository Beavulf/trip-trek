"use client";

// Sheet — глубокий примитив нижней панели: portal, backdrop, spring-анимация,
// drag-handle на мобильных, sticky-шапка с заголовком, scroll-lock, safe-area.
// Вся зона карты/маршрута (filters/layers/add-place/DaySheet/PlaceDialog) раньше
// держала свои ручные копии этой оболочки; теперь сводится к контенту.
// Фаза 6 углубления карты. Расширенные пропы (header/panelRef/ariaLabel/…)
// обратно совместимы — остальные вкладки пользуются дефолтами.
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";

interface MobileBottomSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Заголовок шапки (можно с бейджем). Игнорируется, если задан header */
  title?: ReactNode;
  titleIcon?: ReactNode;
  /** Полностью своя шапка (PlaceDialog: плитка категории, адрес, чип) */
  header?: ReactNode;
  /** ref на панель — фокус-трап (useDialogA11y) */
  panelRef?: Ref<HTMLDivElement>;
  /** a11y-атрибуты панели при кастомной шапке */
  role?: string;
  ariaLabel?: string;
  children: ReactNode;
  zIndexClass?: string;
  /** Класс ширины панели на десктопе */
  maxWidthClass?: string;
  maxHeightClass?: string;
  /** Класс обёртки контента (паддинги/спейсинг списка) */
  contentClassName?: string;
}

/** Shared mobile bottom sheet — same pattern as AddPlaceSheet. */
export function MobileBottomSheet({
  open,
  onOpenChange,
  title,
  titleIcon,
  header,
  panelRef,
  role,
  ariaLabel,
  children,
  zIndexClass = "z-[100]",
  maxWidthClass = "sm:max-w-md",
  maxHeightClass = "max-h-[92vh]",
  contentClassName,
}: MobileBottomSheetProps) {
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
        className={cn("fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4", zIndexClass)}
      >
        <motion.div
          ref={panelRef}
          role={role}
          aria-modal={role ? true : undefined}
          aria-label={ariaLabel}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "bg-card w-full rounded-t-3xl sm:rounded-3xl overflow-y-auto flex flex-col pb-[env(safe-area-inset-bottom)]",
            maxWidthClass,
            maxHeightClass
          )}
        >
          <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {header !== undefined ? (
            header
          ) : (
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
          )}

          <div className={cn("px-4 sm:px-5 py-4", contentClassName)}>{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
