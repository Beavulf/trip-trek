"use client";

import { useState } from "react";
import { Check, Clock, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useAddExpense } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import type { Participant } from "@/lib/types";

interface MarkSettledButtonProps {
  from: Participant;
  to: Participant;
  amount: number;
}

// Кнопка "Отметить перевод" — записывает перевод как специальную трату
export function MarkSettledButton({ from, to, amount }: MarkSettledButtonProps) {
  const addExpense = useAddExpense();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const [done, setDone] = useState(false);

  // from = должник, to = кредитор (ему должны)
  const isCreditor = currentUserId === to.id;
  const isDebtor = currentUserId === from.id;

  const handleSettle = async () => {
    // Идемпотентность по паре + округлённой сумме (не по часу — иначе повтор в тот же час даёт старый amount)
    const cents = Math.round(amount * 100);
    const settlementKey = `settle-${from.id}-${to.id}-${cents}`;
    try {
      await addExpense.mutateAsync({
        amount: cents / 100,
        category: "settlement",
        description: `Перевод: ${from.name} → ${to.name}`,
        paidById: from.id,
        splitWith: [to.id],
        excludeSelf: true,
        settlementKey,
      });
      toast.success("Перевод подтверждён ✅", { description: `${amount.toFixed(2)} от ${from.name}` });
      setDone(true);
    } catch (err) {
      toast.error("Не удалось подтвердить перевод", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  if (done) {
    return (
      <span className="shrink-0 min-h-11 text-xs text-green-600 font-medium flex items-center gap-1 px-3 py-2">
        <Check className="size-3.5" /> Получено
      </span>
    );
  }

  if (!currentUserId) {
    return (
      <a
        href="/login"
        className="shrink-0 min-h-11 text-xs bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 px-3 py-2 rounded-lg font-medium flex items-center gap-1 transition-colors active:scale-95"
        title="Войдите чтобы подтвердить перевод"
      >
        <LogIn className="size-3.5" /> Войти
      </a>
    );
  }

  if (isCreditor) {
    return (
      <button
        type="button"
        onClick={handleSettle}
        disabled={addExpense.isPending}
        className="shrink-0 min-h-11 text-xs bg-green-600/10 text-green-600 hover:bg-green-600/20 px-3 py-2 rounded-lg font-medium flex items-center gap-1 transition-colors active:scale-95 disabled:opacity-50"
        title={`Подтвердить что ${from.name} перевёл ${amount.toFixed(2)}`}
      >
        {addExpense.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        Перевели
      </button>
    );
  }

  if (isDebtor) {
    return (
      <span className="shrink-0 min-h-11 text-xs text-muted-foreground flex items-center gap-1 px-3 py-2">
        <Clock className="size-3.5" /> Ждём подтверждения
      </span>
    );
  }

  return null;
}
