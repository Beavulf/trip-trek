"use client";

import { useCurrency } from "@/hooks/use-trip";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CURRENCIES } from "@/lib/currencies";

export function CurrencyConverter() {
  const { data: rates, isLoading, isError, refetch, isFetching } = useCurrency();
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("CNY");

  const convert = (amt: number, f: string, t: string): number => {
    if (!rates?.rates[f] || !rates?.rates[t]) return 0;
    const inUsd = amt / rates.rates[f];
    return inUsd * rates.rates[t];
  };

  const amountNum = parseFloat(amount) || 0;
  const result = convert(amountNum, from, to);
  const missingRate = amountNum > 0 && (!rates?.rates[from] || !rates?.rates[to]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-card border border-border p-4"
    >
      <div className="flex items-center justify-between gap-2 text-sm font-semibold mb-3">
        <span>💱 Конвертер валют</span>
        {rates && (
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="size-11 rounded-lg hover:bg-accent grid place-items-center text-muted-foreground disabled:opacity-50"
            aria-label="Обновить курсы"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" /> Загрузка курсов…
        </div>
      ) : isError || !rates ? (
        <div className="py-4 text-center space-y-2">
          <p className="text-sm text-muted-foreground">Не удалось загрузить курсы</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex min-h-11 items-center rounded-lg bg-primary text-primary-foreground px-4 text-xs font-medium"
          >
            Обновить
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-input bg-background px-2 py-2.5 text-sm w-28 min-h-11"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 min-h-11 rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-right font-medium"
                placeholder="0"
              />
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={swap}
                className="size-11 rounded-full bg-muted hover:bg-accent grid place-items-center transition-colors active:scale-90"
                title="Поменять местами"
                aria-label="Поменять валюты"
              >
                <ArrowRight className="size-4 rotate-90" />
              </button>
            </div>

            <div className="flex gap-2">
              <select
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-input bg-background px-2 py-2.5 text-sm w-28 min-h-11"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                ))}
              </select>
              <div className="flex-1 min-h-11 rounded-lg border border-input bg-muted/30 px-3 py-2.5 text-sm text-right font-bold flex items-center justify-end">
                {result.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between flex-wrap gap-1">
            <span>
              1 {from} = {convert(1, from, to).toFixed(2)} {to}
            </span>
            <span className={cn("flex items-center gap-1", rates.fallback && "text-amber-500")}>
              {rates.fallback
                ? "⚠ примерные курсы"
                : rates.updated
                  ? <>🔄 {new Date(rates.updated).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</>
                  : "🔄 обновлено"}
            </span>
          </div>

          {missingRate && (
            <div className="mt-2 text-[11px] text-amber-500 bg-amber-500/10 rounded-lg px-2 py-1.5 border border-amber-500/20">
              ⚠ Курс для одной из валют недоступен
            </div>
          )}

          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[10, 50, 100, 500, 1000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="min-h-11 px-3 rounded-full text-[11px] bg-muted hover:bg-accent transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
