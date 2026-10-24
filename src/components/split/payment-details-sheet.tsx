"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSavePaymentDetails } from "@/hooks/split/use-split";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { StickySubmit } from "@/components/trip/quick-add/StickySubmit";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string;
  current: string | null;
}

/** Быстрый ввод «как мне вернуть деньги» прямо из «Сочтёмся». Хранится в профиле — едет во все группы и поездки. */
export function PaymentDetailsSheet({ open, onOpenChange, groupId, current }: Props) {
  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Как вернуть вам деньги">
      <Body groupId={groupId} current={current} onDone={() => onOpenChange(false)} />
    </MobileBottomSheet>
  );
}

function Body({ groupId, current, onDone }: { groupId: string; current: string | null; onDone: () => void }) {
  const save = useSavePaymentDetails(groupId);
  const [text, setText] = useState(current ?? "");
  const dirty = text.trim() !== (current ?? "");

  const submit = async () => {
    try {
      await save.mutateAsync(text.trim() || null);
      toast.success(text.trim() ? "Реквизиты сохранены" : "Реквизиты удалены");
      onDone();
    } catch (e) {
      toast.error("Не удалось сохранить", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="space-y-3 pt-1">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Когда вам должны, человек увидит это в долге и сможет скопировать одним нажатием — не придётся спрашивать номер карты.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={300}
        rows={4}
        autoFocus
        aria-label="Реквизиты"
        placeholder={"Карта 5375 41•• •••• 1234 (Иван И.)\nЕРИП: …\nИли напишите, чем удобно расплатиться, — например «оплатите мне интернет»"}
        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none"
      />
      <p className="text-[11px] text-muted-foreground leading-snug">
        Видят только участники ваших групп и поездок. В уведомления и пуши реквизиты не попадают. Тот же текст — в профиле, «Куда возвращать долги».
      </p>
      <StickySubmit>
        <button
          type="button"
          onClick={submit}
          disabled={!dirty || save.isPending}
          className={cn(
            "w-full rounded-xl py-3.5 min-h-[48px] text-base font-semibold flex items-center justify-center gap-2 bg-primary text-primary-foreground active:scale-[0.98] transition-[transform,opacity]",
            (!dirty || save.isPending) && "opacity-50"
          )}
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Сохранить
        </button>
      </StickySubmit>
    </div>
  );
}
