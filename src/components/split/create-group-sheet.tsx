"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreateGroup } from "@/hooks/split/use-split";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { StickySubmit } from "@/components/trip/quick-add/StickySubmit";
import { ColorPicker, CurrencySelect, EmojiPicker, SWATCHES } from "./pickers";
import { inputClass } from "./ui";

const CURRENCY_KEY = "triptrek-split-currency";

function lastCurrency(): string {
  try {
    return localStorage.getItem(CURRENCY_KEY) || "BYN";
  } catch {
    return "BYN";
  }
}

export function CreateGroupSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Новая группа">
      <CreateBody onDone={() => onOpenChange(false)} />
    </MobileBottomSheet>
  );
}

function CreateBody({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const create = useCreateGroup();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏠");
  const [color, setColor] = useState(SWATCHES[0]);
  const [currency, setCurrency] = useState(lastCurrency);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Назови группу", { description: "Например, «Квартира» или «Наша компания»" });
      return;
    }
    try {
      const g = await create.mutateAsync({ name, emoji, color, currency });
      try {
        localStorage.setItem(CURRENCY_KEY, currency);
      } catch {
        // приватный режим: просто не запоминаем валюту
      }
      onDone();
      // Сразу к приглашению: группа без людей бесполезна
      router.push(`/split/${g.id}?invite=1`);
    } catch (e) {
      toast.error("Не удалось создать группу", { description: e instanceof Error ? e.message : "Попробуй ещё раз" });
    }
  };

  return (
    <div className="space-y-4 pt-1">
      <div>
        <label htmlFor="new-group-name" className="text-xs text-muted-foreground mb-1 block">
          Название
        </label>
        <input
          id="new-group-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Квартира, Наша компания, Мы вдвоём…"
          maxLength={60}
          enterKeyHint="done"
          className={inputClass}
        />
      </div>
      <EmojiPicker value={emoji} onChange={setEmoji} />
      <ColorPicker value={color} onChange={setColor} />
      <div>
        <CurrencySelect value={currency} onChange={setCurrency} />
        <p className="text-[11px] text-muted-foreground mt-1">Все суммы группы хранятся в этой валюте. Потом поменять нельзя, когда появятся траты.</p>
      </div>
      <StickySubmit>
        <button
          type="button"
          onClick={submit}
          disabled={create.isPending}
          className={cn("w-full rounded-xl py-3.5 min-h-[48px] text-base font-semibold flex items-center justify-center gap-2 bg-primary text-primary-foreground active:scale-[0.98] transition-transform", create.isPending && "opacity-60")}
        >
          {create.isPending && <Loader2 className="size-4 animate-spin" />} Создать группу
        </button>
      </StickySubmit>
    </div>
  );
}
