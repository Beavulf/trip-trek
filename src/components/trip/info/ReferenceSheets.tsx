"use client";

import { useState } from "react";
import { Copy, ExternalLink, Loader2, NotebookText, Pencil, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { copyText } from "@/components/trip/lodging/stay-actions";
import { useAddInfo, useDeleteInfo, useUpdateInfo, type InfoItem } from "@/hooks/use-trip";
import { findCallTargets, findUrl, INFO_TYPES, REFERENCE_PRESETS, type ReferencePreset } from "@/lib/info-page";
import { cn } from "@/lib/utils";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Попробуйте ещё раз");
const action = "min-h-11 rounded-xl border border-border inline-flex items-center justify-center gap-1.5 text-sm font-medium hover:bg-accent active:scale-[0.98] transition-transform";

/** Запись целиком: длинный текст и все действия с ней */
export function ReferenceDetailSheet({
  item,
  canEdit,
  onClose,
  onEdit,
}: {
  item: InfoItem;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const del = useDeleteInfo();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = INFO_TYPES[item.type] ?? INFO_TYPES.other;
  const calls = findCallTargets(item);
  const url = findUrl(item.content);

  const remove = async () => {
    try {
      await del.mutateAsync(item.id);
      toast.success("Запись удалена");
      onClose();
    } catch (e) {
      toast.error("Не удалось удалить", { description: errorText(e) });
    }
  };

  return (
    <MobileBottomSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title={item.title}
      titleIcon={<span className="text-lg" aria-hidden="true">{meta.emoji}</span>}
    >
      <div className="space-y-3">
        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{item.content}</p>

        {calls.length > 0 && (
          <div className="space-y-2">
            {calls.map((c) => (
              <a key={c.number} href={`tel:${c.number}`} className={cn(action, "w-full border-transparent bg-primary text-primary-foreground hover:bg-primary")}>
                <Phone className="size-4" aria-hidden="true" /> Позвонить {c.number}
                {c.label && <span className="font-normal opacity-80">{c.label}</span>}
              </a>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => copyText(`${item.title}\n${item.content}`, "Скопировано")}
            className={cn(action, !url && "col-span-2")}
          >
            <Copy className="size-4" aria-hidden="true" /> Скопировать
          </button>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className={action}>
              <ExternalLink className="size-4" aria-hidden="true" /> Открыть ссылку
            </a>
          )}
        </div>

        {canEdit && (
          <div className="border-t border-border pt-3">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm">Удалить запись?</span>
                <button type="button" onClick={() => void remove()} disabled={del.isPending} className="btn-confirm-yes px-4">Удалить</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="btn-confirm-no">Нет</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={onEdit} className={action}>
                  <Pencil className="size-4" aria-hidden="true" /> Изменить
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className={cn(action, "text-muted-foreground hover:text-destructive")}>
                  <Trash2 className="size-4" aria-hidden="true" /> Удалить
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
}

const FORM_TYPES = Object.entries(INFO_TYPES).filter(([key]) => key !== "other");

/** Новая запись или правка. Подсказка под типом объясняет, что сюда писать */
export function ReferenceFormSheet({ item, preset, onClose }: { item?: InfoItem; preset?: ReferencePreset; onClose: () => void }) {
  const add = useAddInfo();
  const update = useUpdateInfo();
  const [type, setType] = useState(item?.type ?? preset?.type ?? "contact");
  const [title, setTitle] = useState(item?.title ?? preset?.title ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const busy = add.isPending || update.isPending;
  const valid = title.trim() && content.trim();
  const presets = REFERENCE_PRESETS.filter((p) => p.type === type);

  const save = async () => {
    if (!valid || busy) return;
    try {
      if (item) await update.mutateAsync({ id: item.id, type, title: title.trim(), content: content.trim() });
      else await add.mutateAsync({ type, title: title.trim(), content: content.trim() });
      onClose();
    } catch (e) {
      toast.error("Не удалось сохранить", { description: errorText(e) });
    }
  };

  return (
    <MobileBottomSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title={item ? "Изменить запись" : "Новая запись"}
      titleIcon={<NotebookText className="size-5 text-primary" />}
      zIndexClass="z-[110]"
    >
      <div className="space-y-3">
        <div>
          <div role="group" aria-label="Тип записи" className="flex flex-wrap gap-1.5">
            {FORM_TYPES.map(([key, meta]) => (
              <button
                key={key}
                type="button"
                onClick={() => setType(key)}
                aria-pressed={type === key}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors",
                  type === key ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {meta.emoji} {meta.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{(INFO_TYPES[type] ?? INFO_TYPES.other).hint}</p>
        </div>

        <div>
          <label htmlFor="reference-title" className="text-xs font-medium text-muted-foreground">Заголовок</label>
          <input
            id="reference-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="mt-1 w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base"
          />
          {!item && presets.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  onClick={() => setTitle(p.title)}
                  className="min-h-8 rounded-full border border-dashed border-border px-2.5 text-[11px] text-muted-foreground hover:bg-accent"
                >
                  {p.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="reference-content" className="text-xs font-medium text-muted-foreground">Текст</label>
          <textarea
            id="reference-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder={"110 — полиция, 120 — скорая\nНомера станут кнопками звонка"}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-base resize-none"
          />
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={!valid || busy}
          className="w-full min-h-12 rounded-xl bg-primary text-sm font-medium text-primary-foreground grid place-items-center disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : item ? "Сохранить" : "Добавить запись"}
        </button>
      </div>
    </MobileBottomSheet>
  );
}
