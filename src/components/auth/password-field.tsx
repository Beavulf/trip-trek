"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Общее поле пароля с глазком: логин/регистрация, сброс пароля, профиль.
// Стили — те же hand-rolled инпуты, что и на /login (rounded-xl).

interface PasswordFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  /** Подсветка валидности: undefined — нейтрально, true — зелёный, false — красный */
  status?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  ariaLabel?: string;
}

export function PasswordField({ value, onChange, placeholder, autoComplete, autoFocus, status, onKeyDown, ariaLabel }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "••••••"}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className={`w-full rounded-xl border bg-background px-3 py-2.5 pr-10 text-sm [&::-ms-reveal]:hidden ${
          status === false ? "border-red-500" : status === true ? "border-green-500" : "border-input"
        }`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={ariaLabel ?? "Показать или скрыть пароль"}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
