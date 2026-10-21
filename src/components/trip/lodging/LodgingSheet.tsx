"use client";

// Шторка «Новое жильё» / «Изменить жильё». Поля сгруппированы по смыслу: где, когда,
// бронь — чтобы длинная форма читалась как три коротких шага. Все необязательные
// поля пустые по умолчанию: жильё можно завести за полминуты (название + даты),
// а адрес на местном языке и телефон дописать позже.

import { useState, type ReactNode } from "react";
import { BedDouble, Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { useCreateLodging, useDeleteLodging, useUpdateLodging, type Lodging, type LodgingInput } from "@/hooks/use-trip";
import { addDaysKey, daysBetween, MAX_LODGING_PRICE, toDateKey } from "@/lib/lodging";

export interface LodgingSheetProps {
  /** Редактируем это жильё; null — создаём новое */
  lodging: Lodging | null;
  /** Подстановка для нового: даты (из «дыры» или после последнего выезда), город */
  defaults?: { checkIn: string; checkOut: string; city?: string };
  currencySymbol: string;
  onClose: () => void;
}

const inputCls = "mt-1 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-base";

function Field({ label, htmlFor, hint, children }: { label: ReactNode; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

export function LodgingSheet({ lodging, defaults, currencySymbol, onClose }: LodgingSheetProps) {
  const create = useCreateLodging();
  const update = useUpdateLodging();
  const remove = useDeleteLodging();

  const [name, setName] = useState(lodging?.name ?? "");
  const [nameLocal, setNameLocal] = useState(lodging?.nameLocal ?? "");
  const [city, setCity] = useState(lodging?.city ?? defaults?.city ?? "");
  const [address, setAddress] = useState(lodging?.address ?? "");
  const [checkIn, setCheckIn] = useState(lodging ? toDateKey(lodging.checkIn) : defaults?.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(
    lodging ? toDateKey(lodging.checkOut) : defaults?.checkOut ?? (defaults?.checkIn ? addDaysKey(defaults.checkIn, 1) : "")
  );
  const [checkInTime, setCheckInTime] = useState(lodging?.checkInTime ?? "");
  const [checkOutTime, setCheckOutTime] = useState(lodging?.checkOutTime ?? "");
  const [bookingRef, setBookingRef] = useState(lodging?.bookingRef ?? "");
  const [bookingUrl, setBookingUrl] = useState(lodging?.bookingUrl ?? "");
  const [phone, setPhone] = useState(lodging?.phone ?? "");
  const [price, setPrice] = useState(lodging?.price != null ? String(lodging.price) : "");
  const [notes, setNotes] = useState(lodging?.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const nights = checkIn && checkOut ? daysBetween(checkIn, checkOut) : null;
  const datesOk = nights !== null && nights >= 0;
  const priceNum = price.trim() === "" ? null : Number(price.replace(",", "."));
  const priceOk = priceNum === null || (Number.isFinite(priceNum) && priceNum >= 0 && priceNum <= MAX_LODGING_PRICE);
  const urlOk = !bookingUrl.trim() || /^https?:\/\//i.test(bookingUrl.trim());
  const canSave = name.trim() !== "" && datesOk && priceOk && urlOk;
  const busy = create.isPending || update.isPending || remove.isPending;

  const onCheckInChange = (v: string) => {
    setCheckIn(v);
    // Выезд раньше нового заезда — подтягиваем на следующий день, чтобы форма не «ломалась»
    if (v && (!checkOut || checkOut < v)) setCheckOut(addDaysKey(v, 1));
  };

  const payload = (): LodgingInput => ({
    name: name.trim(),
    nameLocal: nameLocal.trim() || null,
    city: city.trim() || null,
    address: address.trim() || null,
    checkIn,
    checkOut,
    checkInTime: checkInTime || null,
    checkOutTime: checkOutTime || null,
    bookingRef: bookingRef.trim() || null,
    bookingUrl: bookingUrl.trim() || null,
    phone: phone.trim() || null,
    price: priceNum,
    notes: notes.trim() || null,
  });

  const save = async () => {
    if (!canSave || busy) return;
    try {
      if (lodging) await update.mutateAsync({ id: lodging.id, ...payload() });
      else await create.mutateAsync(payload());
      toast.success(lodging ? "Жильё обновлено" : "Жильё добавлено 🏨");
      onClose();
    } catch (e) {
      toast.error("Не удалось сохранить", { description: e instanceof Error ? e.message : "Попробуй ещё раз" });
    }
  };

  const del = async () => {
    if (!lodging || busy) return;
    try {
      await remove.mutateAsync(lodging.id);
      toast.success("Жильё удалено");
      onClose();
    } catch (e) {
      toast.error("Не удалось удалить", { description: e instanceof Error ? e.message : "Попробуй ещё раз" });
    }
  };

  return (
    <MobileBottomSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title={lodging ? "Изменить жильё" : "Новое жильё"}
      titleIcon={<BedDouble className="size-5 text-primary" />}
    >
      <div className="space-y-5">
        <Section title="Где">
          <Field label="Название *" htmlFor="lg-name">
            <input id="lg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Как называется жильё" className={inputCls} />
          </Field>
          <Field
            label="Название на местном языке"
            htmlFor="lg-local"
            hint="Если страна пишет на другом языке, это крупно покажем таксисту"
          >
            <input id="lg-local" value={nameLocal} onChange={(e) => setNameLocal(e.target.value)} maxLength={200} placeholder="Как написано на вывеске или в брони" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Город" htmlFor="lg-city">
              <input id="lg-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} placeholder="Город" className={inputCls} />
            </Field>
            <Field label="Телефон" htmlFor="lg-phone">
              <input id="lg-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="+" className={inputCls} />
            </Field>
          </div>
          <Field label="Адрес" htmlFor="lg-address" hint="Лучше на местном языке — его прочтёт водитель">
            <textarea id="lg-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={400} rows={2} placeholder="Улица, дом, город — как в брони" className={cn(inputCls, "resize-none")} />
          </Field>
        </Section>

        <Section title="Когда">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Заезд *" htmlFor="lg-in">
              <input id="lg-in" type="date" value={checkIn} onChange={(e) => onCheckInChange(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Выезд *" htmlFor="lg-out">
              <input id="lg-out" type="date" value={checkOut} min={checkIn || undefined} onChange={(e) => setCheckOut(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Время заезда" htmlFor="lg-in-t">
              <input id="lg-in-t" type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Время выезда" htmlFor="lg-out-t">
              <input id="lg-out-t" type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} className={inputCls} />
            </Field>
          </div>
          {nights !== null && (
            <p className={cn("text-xs font-medium", datesOk ? "text-primary" : "text-destructive")}>
              {datesOk
                ? nights === 0
                  ? "Без ночёвки (выезд в день заезда)"
                  : `🌙 ${nights} ${plural(nights, "ночь", "ночи", "ночей")}`
                : "Выезд раньше заезда"}
            </p>
          )}
        </Section>

        <Section title="Бронь">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Номер брони" htmlFor="lg-ref">
              <input id="lg-ref" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} maxLength={100} className={inputCls} />
            </Field>
            <Field label={`Стоимость, ${currencySymbol}`} htmlFor="lg-price" hint="За всё проживание">
              <input id="lg-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className={cn(inputCls, !priceOk && "border-destructive")} />
            </Field>
          </div>
          <Field label="Ссылка на бронь" htmlFor="lg-url">
            <input id="lg-url" type="url" inputMode="url" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} maxLength={500} placeholder="https://…" className={cn(inputCls, !urlOk && "border-destructive")} />
          </Field>
          <Field label="Заметки" htmlFor="lg-notes">
            <textarea id="lg-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2} placeholder="Завтрак, код от двери, этаж…" className={cn(inputCls, "resize-none")} />
          </Field>
        </Section>

        <button
          type="button"
          onClick={save}
          disabled={!canSave || busy}
          className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {create.isPending || update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {lodging ? "Сохранить" : "Добавить жильё"}
        </button>

        {lodging &&
          (confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex-1">Удалить это жильё?</span>
              <button type="button" onClick={del} disabled={busy} className="min-h-11 px-4 rounded-xl bg-destructive text-white text-xs font-semibold disabled:opacity-50">
                {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : "Да, удалить"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 px-4 rounded-xl border border-input text-xs font-medium">
                Отмена
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full min-h-11 rounded-xl text-xs font-medium text-destructive inline-flex items-center justify-center gap-1.5 hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="size-4" /> Удалить жильё
            </button>
          ))}
      </div>
    </MobileBottomSheet>
  );
}
