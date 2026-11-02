"use client";

import { ChevronDown } from "lucide-react";
import { currencyGroups, currencyLabel, currencyOf } from "@/lib/currencies";
import { cn } from "@/lib/utils";

interface CurrencySelectProps {
  value: string;
  onChange: (code: string) => void;
  /** Классы поля: рамка, отступы, ширина — как у соседних полей формы */
  className?: string;
  /** Закреплённая сверху валюта (валюта группы в «Сочтёмся») */
  pinned?: string | null;
  ariaLabel?: string;
}

/**
 * Выбор валюты: системный список телефона поверх компактного поля. Валют полторы сотни, и названия
 * со страной нужны только в раскрытом списке: в закрытом поле они раздули бы форму суммы.
 */
export function CurrencySelect({ value, onChange, className, pinned, ariaLabel = "Валюта" }: CurrencySelectProps) {
  const { popular, rest } = currencyGroups(value, pinned);
  return (
    <span className={cn("relative inline-flex items-center justify-between gap-1 focus-within:ring-2 focus-within:ring-ring/40", className)}>
      <span aria-hidden="true" className="whitespace-nowrap">
        {currencyOf(value)?.flag ?? "🏳️"} {value}
      </span>
      <ChevronDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="absolute inset-0 size-full cursor-pointer opacity-0 text-base"
      >
        <optgroup label="Частые">
          {popular.map((c) => (
            <option key={c.code} value={c.code}>{currencyLabel(c)}</option>
          ))}
        </optgroup>
        <optgroup label="Все страны">
          {rest.map((c) => (
            <option key={c.code} value={c.code}>{currencyLabel(c)}</option>
          ))}
        </optgroup>
      </select>
    </span>
  );
}
