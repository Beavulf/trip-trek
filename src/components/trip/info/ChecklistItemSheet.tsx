"use client";

import { useRef, useState } from "react";
import { Check, ListChecks, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { useAddChecklist, useDeleteChecklist, useToggleChecklist, type ChecklistItem } from "@/hooks/use-trip";
import { CHECKLIST_CATS } from "@/lib/info-page";
import { cn } from "@/lib/utils";

export type ChecklistSheetTarget = { mode: "add"; category: string } | { mode: "edit"; item: ChecklistItem };

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Попробуйте ещё раз");

/** Новый пункт или правка существующего. Добавление не закрывает окно: пункты обычно вносят пачкой */
export function ChecklistItemSheet({ target, onClose }: { target: ChecklistSheetTarget; onClose: () => void }) {
  const editing = target.mode === "edit" ? target.item : null;
  const add = useAddChecklist();
  const update = useToggleChecklist();
  const del = useDeleteChecklist();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(editing?.text ?? "");
  const initialCategory = editing ? (editing.category in CHECKLIST_CATS ? editing.category : "other") : target.mode === "add" ? target.category : "other";
  const [category, setCategory] = useState(initialCategory);
  const [added, setAdded] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = add.isPending || update.isPending || del.isPending;

  const save = async () => {
    const value = text.trim();
    if (!value || busy) return;
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, text: value, category });
        onClose();
      } else {
        await add.mutateAsync([{ text: value, category }]);
        setText("");
        setAdded((n) => n + 1);
        inputRef.current?.focus();
      }
    } catch (e) {
      toast.error("Не удалось сохранить", { description: errorText(e) });
    }
  };

  const remove = async () => {
    if (!editing) return;
    try {
      await del.mutateAsync(editing.id);
      toast.success("Пункт удалён");
      onClose();
    } catch (e) {
      toast.error("Не удалось удалить", { description: errorText(e) });
    }
  };

  return (
    <MobileBottomSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title={editing ? "Пункт чек-листа" : "Новый пункт"}
      titleIcon={<ListChecks className="size-5 text-primary" />}
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="checklist-text" className="text-xs font-medium text-muted-foreground">Что сделать или взять</label>
          <input
            id="checklist-text"
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
            maxLength={200}
            enterKeyHint="done"
            autoFocus={!editing}
            placeholder="Например, адаптер для розеток"
            className="mt-1 w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base"
          />
        </div>

        <div>
          <span id="checklist-cat" className="text-xs font-medium text-muted-foreground">Раздел</span>
          <div role="group" aria-labelledby="checklist-cat" className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(CHECKLIST_CATS).map(([key, meta]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                aria-pressed={category === key}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors",
                  category === key ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {meta.emoji} {meta.label}
              </button>
            ))}
          </div>
        </div>

        {added > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <Check className="size-3.5 text-emerald-500" aria-hidden="true" /> Добавлено: {added}. Можно вписать ещё
          </p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={!text.trim() || busy}
          className="w-full min-h-12 rounded-xl bg-primary text-sm font-medium text-primary-foreground grid place-items-center disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {add.isPending || update.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : editing ? "Сохранить" : "Добавить"}
        </button>

        {editing &&
          (confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm">Удалить пункт?</span>
              <button type="button" onClick={() => void remove()} disabled={busy} className="btn-confirm-yes px-4">Удалить</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn-confirm-no">Нет</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full min-h-11 rounded-xl text-sm text-muted-foreground inline-flex items-center justify-center gap-1.5 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" /> Удалить пункт
            </button>
          ))}
      </div>
    </MobileBottomSheet>
  );
}
