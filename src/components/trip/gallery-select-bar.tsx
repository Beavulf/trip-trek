"use client";

// Панель мультивыбора галереи: липкий низ над FAB (как плашка прогресса загрузки).
// Подписи «В избранное»/«Скрыть от гостей» динамические — если всё выбранное уже
// в состоянии, предлагаем обратное. Удаление честно про права: не-владелец удалит
// только свои кадры (сервер чужие отклоняет 403).
import { useState } from "react";
import { Eye, EyeOff, Star, Trash2, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, plural } from "@/lib/utils";

interface GallerySelectBarProps {
  count: number;
  /** Все выбранные уже в избранном → действие «убрать» */
  allFavorite: boolean;
  /** Все выбранные уже скрыты → действие «показать» */
  allHidden: boolean;
  /** Сколько из выбранных пользователь вправе удалить (owner — все) */
  deletableCount: number;
  pending: boolean;
  onFavorite: () => void;
  onHidden: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
}

const actionBtn =
  "flex-1 min-w-[104px] min-h-11 rounded-xl border border-border bg-card text-foreground text-xs font-medium inline-flex items-center justify-center gap-1.5 px-2 active:scale-95 transition-transform disabled:opacity-50";

export function GallerySelectBar({
  count,
  allFavorite,
  allHidden,
  deletableCount,
  pending,
  onFavorite,
  onHidden,
  onDelete,
  onSelectAll,
  onClear,
  onDone,
}: GallerySelectBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deletable = deletableCount > 0;

  return (
    // z-50: перекрывает FAB быстрых добавлений (z-40) — в режиме выбора он не нужен
    <div className="fixed inset-x-3 bottom-24 z-50 rounded-2xl border border-border bg-card shadow-lg p-2 space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold px-1">
          Выбрано {count}
        </span>
        <button
          type="button"
          onClick={onSelectAll}
          className="ml-auto text-xs text-primary font-medium px-2 py-2 min-h-11 active:scale-95 transition-transform"
        >
          Выбрать всё
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground font-medium px-2 py-2 min-h-11 active:scale-95 transition-transform"
        >
          Снять
        </button>
        <button
          type="button"
          onClick={onDone}
          aria-label="Готово"
          title="Готово"
          className="size-11 shrink-0 rounded-xl border border-border bg-card text-muted-foreground grid place-items-center active:scale-95 transition-transform"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onFavorite}
          disabled={pending}
          className={cn(actionBtn, allFavorite && "bg-amber-400/15 border-amber-400/50")}
        >
          <Star className={cn("size-4", allFavorite && "fill-amber-400 text-amber-500")} />
          {allFavorite ? "Убрать из избранного" : "В избранное"}
        </button>
        <button
          type="button"
          onClick={onHidden}
          disabled={pending}
          className={cn(actionBtn, allHidden && "bg-sky-400/15 border-sky-400/50")}
        >
          {allHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          {allHidden ? "Показать гостям" : "Скрыть от гостей"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={pending || !deletable}
          title={deletable ? undefined : "Среди выбранных нет кадров, которые вам можно удалить"}
          className={cn(actionBtn, "text-destructive border-destructive/40")}
        >
          <Trash2 className="size-4" />
          Удалить
        </button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Удалить {count} {plural(count, "кадр", "кадра", "кадров")}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletableCount < count
                ? `Ваши кадры среди выбранных: ${deletableCount}. Чужие кадры вам удалить не дадут — они будут пропущены.`
                : "Кадры исчезнут у всех участников поездки. Отменить удаление нельзя."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
