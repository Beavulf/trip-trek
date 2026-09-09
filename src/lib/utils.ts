import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Русская форма слова по числу: plural(21, "день", "дня", "дней") → "день" */
export function plural(n: number, one: string, few: string, many: string) {
  const abs = Math.abs(Math.trunc(n))
  if (abs % 10 === 1 && abs % 100 !== 11) return one
  if ([2, 3, 4].includes(abs % 10) && ![12, 13, 14].includes(abs % 100)) return few
  return many
}
