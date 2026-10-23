"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDeleteGroup, useUpdateGroup } from "@/hooks/split/use-split";
import type { GroupModel } from "@/hooks/split/use-group-model";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { StickySubmit } from "@/components/trip/quick-add/StickySubmit";
import { ColorPicker, CurrencySelect, EmojiPicker } from "./pickers";
import { inputClass, SecondaryButton } from "./ui";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  model: GroupModel;
  onDeleted: () => void;
}

export function GroupSettingsSheet({ open, onOpenChange, model, onDeleted }: Props) {
  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Настройки группы">
      <SettingsBody model={model} onDone={() => onOpenChange(false)} onDeleted={onDeleted} />
    </MobileBottomSheet>
  );
}

function SettingsBody({ model, onDone, onDeleted }: { model: GroupModel; onDone: () => void; onDeleted: () => void }) {
  const group = model.group!;
  const update = useUpdateGroup(group.id);
  const del = useDeleteGroup(group.id);
  const isOwner = group.myRole === "owner";
  const hasMoney = model.expenses.length + model.payments.length > 0;

  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);
  const [color, setColor] = useState(group.color);
  const [currency, setCurrency] = useState(group.currency);
  const [allowInvites, setAllowInvites] = useState(group.allowMemberInvites);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const save = async () => {
    if (!name.trim()) {
      toast.error("Назови группу");
      return;
    }
    try {
      await update.mutateAsync({
        name,
        emoji,
        color,
        ...(isOwner ? { allowMemberInvites: allowInvites } : {}),
        ...(isOwner && !hasMoney && currency !== group.currency ? { currency } : {}),
      });
      toast.success("Настройки сохранены");
      onDone();
    } catch (e) {
      toast.error("Не удалось сохранить", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const remove = async () => {
    try {
      await del.mutateAsync(confirmName.trim());
      toast.success("Группа удалена");
      onDone();
      onDeleted();
    } catch (e) {
      toast.error("Не удалось удалить", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="space-y-4 pt-1">
      <div>
        <label htmlFor="g-name" className="text-xs text-muted-foreground mb-1 block">
          Название
        </label>
        <input id="g-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} />
      </div>
      <EmojiPicker value={emoji} onChange={setEmoji} />
      <ColorPicker value={color} onChange={setColor} />

      {isOwner && (
        <>
          <div>
            <CurrencySelect value={currency} onChange={setCurrency} disabled={hasMoney} />
            {hasMoney && <p className="text-[11px] text-muted-foreground mt-1">Валюту можно менять только в группе без трат и переводов: суммы хранятся в ней как есть.</p>}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={allowInvites}
            onClick={() => setAllowInvites((v) => !v)}
            className="w-full flex items-center gap-3 rounded-xl border border-border px-3 min-h-12 text-left"
          >
            <span className="flex-1">
              <span className="block text-sm font-medium">Звать могут все участники</span>
              <span className="block text-[11px] text-muted-foreground">Если выключить, код приглашения видишь только ты</span>
            </span>
            <span className={cn("w-10 h-6 rounded-full p-0.5 transition-colors shrink-0", allowInvites ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("block size-5 rounded-full bg-white shadow transition-transform", allowInvites && "translate-x-4")} />
            </span>
          </button>

          <div className="pt-2 border-t border-border">
            {deleting ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm">
                  Все траты, переводы и журнал группы удалятся <b>для всех участников</b> без возможности вернуть. Чтобы подтвердить, введи название: <b>{group.name}</b>
                </p>
                <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={group.name} className={inputClass} aria-label="Название группы для подтверждения" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={remove}
                    disabled={confirmName.trim() !== group.name || del.isPending}
                    className="flex-1 min-h-11 rounded-xl bg-destructive text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98] transition-transform"
                  >
                    {del.isPending && <Loader2 className="size-4 animate-spin" />} Удалить навсегда
                  </button>
                  <SecondaryButton className="flex-1" onClick={() => setDeleting(false)}>
                    Отмена
                  </SecondaryButton>
                </div>
              </div>
            ) : (
              <SecondaryButton className="w-full text-destructive" onClick={() => setDeleting(true)}>
                <Trash2 className="size-4" /> Удалить группу
              </SecondaryButton>
            )}
          </div>
        </>
      )}

      <StickySubmit>
        <button type="button" onClick={save} disabled={update.isPending} className={cn("w-full rounded-xl py-3.5 min-h-[48px] text-base font-semibold flex items-center justify-center gap-2 bg-primary text-primary-foreground active:scale-[0.98] transition-transform", update.isPending && "opacity-60")}>
          {update.isPending && <Loader2 className="size-4 animate-spin" />} Сохранить
        </button>
      </StickySubmit>
    </div>
  );
}
