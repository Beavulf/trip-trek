"use client";

import { useState } from "react";
import { Check, Clock, Loader2 } from "lucide-react";
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
  const isCreditor = currentUserId === to.id; // Мне должны → я подтверждаю получение
  const isDebtor = currentUserId === from.id; // Я должен → жду подтверждения

  const handleSettle = async () => {
    // Создаём settlement-трату: должник (from) "заплатил" кредитору (to)
    // splitWith = to, excludeSelf = true → создаёт обратный долг (to должен from)
    // Этот обратный долг компенсирует исходный
    await addExpense.mutateAsync({
      amount: Math.round(amount * 100) / 100,
      category: "settlement",
      description: `Перевод: ${from.name} → ${to.name}`,
      paidById: from.id,
      splitWith: [to.id],
      excludeSelf: true,
    });
    toast.success("Перевод подтверждён ✅", { description: `$${amount.toFixed(2)} от ${from.name}` });
    setDone(true);
  };

  if (done) {
    return (
      <span className="shrink-0 text-[10px] text-green-600 font-medium flex items-center gap-1 px-2 py-1">
        <Check className="size-3" /> Получено
      </span>
    );
  }

  // Кредитор (ему должны) — может нажать "Перевели" чтобы подтвердить получение
  if (isCreditor) {
    return (
      <button
        onClick={handleSettle}
        disabled={addExpense.isPending}
        className="shrink-0 text-[10px] bg-green-600/10 text-green-600 hover:bg-green-600/20 px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors active:scale-95"
        title={`Подтвердить что ${from.name} перевёл $${amount.toFixed(2)}`}
      >
        {addExpense.isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        Перевели
      </button>
    );
  }

  // Должник — видит что ждут подтверждения
  if (isDebtor) {
    return (
      <span className="shrink-0 text-[10px] text-muted-foreground flex items-center gap-1 px-2 py-1">
        <Clock className="size-3" /> Ждём подтверждения
      </span>
    );
  }

  // Если я ни при чём — ничего не показываем
  return null;
}
