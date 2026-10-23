"use client";

import { cn } from "@/lib/utils";
import { CURRENCIES } from "@/lib/currencies";

// Пикеры для создания/правки группы и участника: значок, цвет, валюта.

export const GROUP_EMOJIS = ["🏠", "👫", "🍕", "🎉", "🏖️", "🚗", "💼", "🐶", "🎮", "❤️", "🛒", "🧳"];
export const MEMBER_EMOJIS = ["🦊", "🐻", "🐼", "🦁", "🐯", "🐨", "🐸", "🦉", "🐧", "🦄", "🐙", "🐝"];
export const SWATCHES = ["#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#eab308", "#64748b"];

/** Валюты «для дома» наверху списка: повседневные траты обычно в местных деньгах. */
const TOP_CURRENCIES = ["BYN", "RUB", "USD", "EUR", "UAH", "KZT"];
export const CURRENCY_OPTIONS = [
  ...TOP_CURRENCIES.flatMap((code) => CURRENCIES.filter((c) => c.code === code)),
  ...CURRENCIES.filter((c) => !TOP_CURRENCIES.includes(c.code)),
];

export function EmojiPicker({ value, onChange, options = GROUP_EMOJIS, label = "Значок" }: { value: string; onChange: (v: string) => void; options?: string[]; label?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={value === e}
            aria-label={e}
            onClick={() => onChange(e)}
            className={cn("size-11 rounded-xl text-xl grid place-items-center border transition-[transform,background-color] active:scale-90", value === e ? "bg-primary/10 border-primary/50" : "border-border hover:bg-accent")}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">Цвет</div>
      <div className="flex gap-2 flex-wrap">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            aria-label={`Цвет ${c}`}
            onClick={() => onChange(c)}
            className={cn("size-9 rounded-full transition-transform active:scale-90 ring-offset-2 ring-offset-card", value === c ? "ring-2 ring-foreground/70 scale-105" : "ring-0")}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

export function CurrencySelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <label htmlFor="split-currency" className="text-xs text-muted-foreground mb-1 block">
        Валюта группы
      </label>
      <select
        id="split-currency"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile min-h-11 disabled:opacity-60"
      >
        {CURRENCY_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.code} · {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
