"use client";

import { BASE_CURRENCY } from "@/lib/currencies";
import type { RateInfo } from "@/hooks/trip/use-currency";

/**
 * Подсказка под суммой в формах траты: во что превратится введённая сумма и можно ли доверять
 * курсу. Без курса кнопка отправки заблокирована (см. canSubmit в формах) — иначе сумма
 * записывалась бы по курсу 1.
 */
export function FxHint({
  code,
  amountNum,
  amountUSD,
  fx,
  withRate = false,
}: {
  code: string;
  amountNum: number;
  amountUSD: number;
  fx: RateInfo;
  /** Показывать курс («по курсу 7.20») — в расширенной форме */
  withRate?: boolean;
}) {
  if (code === BASE_CURRENCY || amountNum <= 0) return <span />;
  if (fx.loading) return <span className="text-muted-foreground">Загружаем курс {code}…</span>;
  if (fx.failed) {
    return (
      <span className="text-red-500">
        Курс {code} недоступен — выбери USD или{" "}
        <button type="button" onClick={fx.refetch} className="underline font-medium">
          повтори
        </button>
      </span>
    );
  }
  const rate = fx.rates?.[code];
  return (
    <span className="text-muted-foreground">
      ≈ <b className="text-foreground">${amountUSD.toFixed(2)}</b>
      {withRate && rate ? ` по курсу ${rate < 1 ? rate.toFixed(4) : rate.toFixed(2)}` : ""}
      {fx.approx && <span className="text-amber-600"> · курс приблизительный</span>}
    </span>
  );
}
