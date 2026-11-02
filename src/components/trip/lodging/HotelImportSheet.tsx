"use client";

// Перенос отелей из маршрута в «Жильё». Предложение — только догадка (см. lib/lodging-import):
// в маршруте записи вроде «ЗАСЕЛЕНИЕ», поэтому названия и даты человек видит и правит до сохранения.
// Сохраняется только то, что он оставил отмеченным, одной операцией.

import { useState } from "react";
import { BedDouble, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { useImportLodgings, type LodgingImportStay } from "@/hooks/use-trip";
import { daysBetween } from "@/lib/lodging";
import type { StayProposal } from "@/lib/lodging-import";
import { moneyWhole } from "@/lib/budget/format";
import { cn, plural } from "@/lib/utils";

interface HotelImportSheetProps {
  proposals: StayProposal[];
  currencySymbol: string;
  onClose: () => void;
}

interface Row {
  on: boolean;
  name: string;
  checkIn: string;
  checkOut: string;
}

const inputCls = "mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-base";

export function HotelImportSheet({ proposals, currencySymbol: sym, onClose }: HotelImportSheetProps) {
  const run = useImportLodgings();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(proposals.map((p) => [p.key, { on: true, name: p.name, checkIn: p.checkIn, checkOut: p.checkOut }]))
  );

  const patch = (key: string, next: Partial<Row>) => setRows((r) => ({ ...r, [key]: { ...r[key], ...next } }));

  const chosen = proposals.filter((p) => rows[p.key]?.on);
  const invalid = chosen.some((p) => {
    const r = rows[p.key];
    return !p.lodgingId && (!r.name.trim() || !r.checkIn || !r.checkOut || r.checkOut < r.checkIn);
  });

  const submit = async () => {
    const stays: LodgingImportStay[] = chosen.map((p) => {
      const r = rows[p.key];
      if (p.lodgingId) return { placeIds: p.placeIds, lodgingId: p.lodgingId };
      return {
        placeIds: p.placeIds,
        name: r.name.trim(),
        nameLocal: p.nameLocal,
        city: p.city,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        price: p.price,
      };
    });
    try {
      await run.mutateAsync(stays);
      toast.success(`Перенесено: ${stays.length}`);
      onClose();
    } catch (e) {
      toast.error("Не удалось перенести", { description: e instanceof Error ? e.message : "Попробуйте ещё раз" });
    }
  };

  return (
    <MobileBottomSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title="Отели из маршрута"
      titleIcon={<BedDouble className="size-5 text-primary" />}
    >
      <div className="space-y-3">
        <p className="text-xs text-pretty text-muted-foreground">
          Проверьте названия и даты: мы собрали их из записей маршрута. Места останутся в маршруте,
          а их суммы перейдут в цену жилья и не посчитаются в плане дважды.
        </p>

        <ul className="space-y-2">
          {proposals.map((p) => {
            const r = rows[p.key];
            const nights = r.checkIn && r.checkOut ? daysBetween(r.checkIn, r.checkOut) : 0;
            const nameId = `import-name-${p.key}`;
            return (
              <li key={p.key} className={cn("rounded-2xl border border-border bg-muted/30 p-3", !r.on && "opacity-60")}>
                <label className="flex min-h-11 items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={r.on}
                    onChange={(e) => patch(p.key, { on: e.target.checked })}
                    className="size-5 shrink-0 accent-[var(--primary)]"
                    aria-label={`Перенести: ${r.name || "без названия"}`}
                  />
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {[p.city, `${p.placeIds.length} ${plural(p.placeIds.length, "запись", "записи", "записей")}`, p.price ? moneyWhole(sym, p.price) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </label>

                {p.lodgingId ? (
                  <p className="mt-1 text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-muted-foreground">Такое жильё уже есть: привяжем записи к нему</span>
                  </p>
                ) : (
                  <div className={cn("mt-1 space-y-2", !r.on && "pointer-events-none")}>
                    <div>
                      <label htmlFor={nameId} className="text-xs font-medium text-muted-foreground">Название</label>
                      <input id={nameId} value={r.name} onChange={(e) => patch(p.key, { name: e.target.value })} maxLength={200} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor={`${nameId}-in`} className="text-xs font-medium text-muted-foreground">Заезд</label>
                        <input id={`${nameId}-in`} type="date" value={r.checkIn} onChange={(e) => patch(p.key, { checkIn: e.target.value })} className={inputCls} />
                      </div>
                      <div>
                        <label htmlFor={`${nameId}-out`} className="text-xs font-medium text-muted-foreground">Выезд</label>
                        <input id={`${nameId}-out`} type="date" value={r.checkOut} min={r.checkIn || undefined} onChange={(e) => patch(p.key, { checkOut: e.target.value })} className={inputCls} />
                      </div>
                    </div>
                    <p className={cn("text-xs tabular-nums", nights < 0 ? "text-destructive" : "text-muted-foreground")}>
                      {nights < 0 ? "Выезд раньше заезда" : nights === 0 ? "Без ночёвки" : `${nights} ${plural(nights, "ночь", "ночи", "ночей")}`}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={submit}
          disabled={chosen.length === 0 || invalid || run.isPending}
          className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {run.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
          {chosen.length > 0 ? `Перенести: ${chosen.length}` : "Отметьте, что перенести"}
        </button>
        {invalid && <p className="text-center text-xs text-muted-foreground">Проверьте названия и даты у отмеченных</p>}
      </div>
    </MobileBottomSheet>
  );
}
