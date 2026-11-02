"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { useAddChecklist, type ChecklistItem } from "@/hooks/use-trip";
import { CHECKLIST_CATS, CHECKLIST_TEMPLATES, hasChecklistText } from "@/lib/info-page";
import { cn, plural } from "@/lib/utils";

const keyOf = (cat: string, text: string) => `${cat}::${text}`;

/** Готовые наборы. Уже добавленное видно сразу: раньше повторное открытие плодило дубли */
export function ChecklistTemplatesSheet({ items, onClose }: { items: ChecklistItem[]; onClose: () => void }) {
  const add = useAddChecklist();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (keys: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const confirm = async () => {
    const entries = Object.entries(CHECKLIST_TEMPLATES).flatMap(([category, texts]) =>
      texts.filter((text) => selected.has(keyOf(category, text))).map((text) => ({ category, text }))
    );
    if (entries.length === 0) return;
    try {
      await add.mutateAsync(entries);
      toast.success(`Добавлено: ${entries.length} ${plural(entries.length, "пункт", "пункта", "пунктов")}`);
      onClose();
    } catch (e) {
      toast.error("Не удалось добавить набор", { description: e instanceof Error ? e.message : "" });
    }
  };

  const count = selected.size;

  return (
    <MobileBottomSheet open onOpenChange={(v) => !v && onClose()} title="Шаблоны чек-листа" titleIcon={<Sparkles className="size-5 text-primary" />}>
      <p className="-mt-1 mb-3 text-xs text-muted-foreground">Отметьте нужное, и пункты появятся в чек-листе.</p>
      <div className="space-y-4 pb-2">
        {Object.entries(CHECKLIST_TEMPLATES).map(([cat, texts]) => {
          const meta = CHECKLIST_CATS[cat];
          const free = texts.filter((t) => !hasChecklistText(items, t));
          const freeKeys = free.map((t) => keyOf(cat, t));
          const allOn = free.length > 0 && freeKeys.every((k) => selected.has(k));
          return (
            <section key={cat} aria-label={meta.label}>
              <div className="mb-1.5 flex min-h-9 items-center gap-2">
                <span aria-hidden="true">{meta.emoji}</span>
                <h3 className="min-w-0 flex-1 text-sm font-semibold">{meta.label}</h3>
                {free.length > 0 && (
                  <button type="button" onClick={() => toggle(freeKeys, !allOn)} className="min-h-9 px-2 text-xs font-medium text-primary">
                    {allOn ? "Снять все" : "Выбрать все"}
                  </button>
                )}
              </div>
              <div className="overflow-hidden rounded-xl border border-border divide-y divide-border/60">
                {texts.map((text) => {
                  const key = keyOf(cat, text);
                  const added = hasChecklistText(items, text);
                  const on = selected.has(key);
                  return (
                    <button
                      key={text}
                      type="button"
                      disabled={added}
                      onClick={() => toggle([key], !on)}
                      aria-pressed={on}
                      className="flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-accent disabled:hover:bg-transparent"
                    >
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
                          on ? "border-transparent bg-primary text-primary-foreground" : added ? "border-transparent bg-muted text-muted-foreground" : "border-muted-foreground/40"
                        )}
                      >
                        {(on || added) && <Check className="size-3.5" aria-hidden="true" />}
                      </span>
                      <span className={cn("min-w-0 flex-1 text-sm", added && "text-muted-foreground")}>{text}</span>
                      {added && <span className="shrink-0 text-[11px] text-muted-foreground">уже есть</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Липкая кнопка добавления */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-5 border-t border-border bg-card/95 px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={count === 0 || add.isPending}
          className="grid w-full min-h-12 place-items-center rounded-xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {add.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : count > 0 ? (
            `Добавить ${count} ${plural(count, "пункт", "пункта", "пунктов")}`
          ) : (
            "Отметьте пункты выше"
          )}
        </button>
      </div>
    </MobileBottomSheet>
  );
}
