"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";

/** Маркер открытого вложенного шита: родитель с фокус-ловушкой (QuickAddSheet) по Escape его не закрывает. */
export const NESTED_SHEET_ATTR = "data-nested-sheet";

interface CategoryFieldProps {
  value: string;
  onChange: (key: string) => void;
}

/**
 * Категория траты: одна кнопка и список поверх формы, как в «Сочтёмся» (split/expense-sheet),
 * только список в один столбец.
 * Ряд чипов, который прокручивается влево-вправо, прятал половину категорий и промахивался под пальцем.
 * Одно поле на обе формы траты (быстрое добавление и вкладка «Бюджет»).
 */
export function CategoryField({ value, onChange }: CategoryFieldProps) {
  const [open, setOpen] = useState(false);
  const current = EXPENSE_CATEGORIES[value] ?? EXPENSE_CATEGORIES.other;

  // Escape закрывает только список: фокус-ловушка шита быстрого добавления слушает его на document
  // и пропускает, пока в DOM есть NESTED_SHEET_ATTR
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">Категория</div>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 rounded-xl border border-input bg-background px-3 min-h-12 text-left active:scale-[0.99] transition-transform"
      >
        <span
          className="size-8 rounded-lg grid place-items-center text-lg shrink-0"
          style={{ background: `${current.color}22` }}
          aria-hidden
        >
          {current.emoji}
        </span>
        <span className="flex-1 font-medium">{current.label}</span>
        <ChevronDown className="size-4 text-muted-foreground shrink-0" aria-hidden />
      </button>

      <MobileBottomSheet open={open} onOpenChange={setOpen} title="Категория" zIndexClass="z-[110]" maxWidthClass="sm:max-w-sm">
        {/* Один столбец: «Достопримечательности» не помещается в половину ширины, а семь строк на телефоне влезают */}
        <ul className="grid grid-cols-1 gap-2" {...{ [NESTED_SHEET_ATTR]: "" }}>
          {Object.entries(EXPENSE_CATEGORIES).map(([key, c]) => {
            const active = key === value;
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-xl border px-3 min-h-14 text-left text-sm font-medium transition-colors active:scale-[0.97]",
                    active ? "border-primary/50 bg-primary/10" : "border-border hover:bg-accent/60"
                  )}
                >
                  <span className="size-9 rounded-lg grid place-items-center text-lg shrink-0" style={{ background: `${c.color}22` }} aria-hidden>
                    {c.emoji}
                  </span>
                  <span className="flex-1 leading-tight">{c.label}</span>
                  {active && <Check className="size-4 text-primary shrink-0" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </MobileBottomSheet>
    </div>
  );
}
