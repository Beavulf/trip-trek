"use client";

import {
  useCreatePlace,
  useRouteDays,
} from "@/hooks/use-trip";
import { useReverseGeocode } from "@/hooks/trip/use-geocode";
import {
  Loader2,
  Check,
  MapPin,
  Plus,
  Map as MapIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatLatLng, coordKey } from "@/lib/utils";
import { MobileBottomSheet } from "./mobile-bottom-sheet";
import { PlaceForm } from "./place-form";
import { parseBudget, type PlaceDraft } from "@/lib/place-draft";
import { MapPicker } from "./map-picker";

export interface AddPlaceData {
  lat: number;
  lng: number;
  address?: string;
  dayId?: string;
  name?: string;
}

export function AddPlaceSheet({
  open,
  onOpenChange,
  initial,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: AddPlaceData | null;
  onCreated?: () => void;
}) {
  if (!initial) return null;

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Новое место"
      titleIcon={<Plus className="size-5 text-primary" />}
      contentClassName="space-y-3"
    >
      <AddPlaceForm
        key={`${coordKey(initial.lat, initial.lng)}-${open}`}
        initial={initial}
        onDone={() => {
          onOpenChange(false);
          onCreated?.();
        }}
        onCancel={() => onOpenChange(false)}
      />
    </MobileBottomSheet>
  );
}

function AddPlaceForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: AddPlaceData;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { data: days } = useRouteDays();
  const create = useCreatePlace();

  const [draft, setDraft] = useState<PlaceDraft>({
    name: initial.name || "",
    category: "sight",
    timeOfDay: "",
    budget: "",
    address: initial.address || "",
    description: "",
    dayId: initial.dayId || "",
  });
  const [lat, setLat] = useState(initial.lat);
  const [lng, setLng] = useState(initial.lng);
  const [mapOpen, setMapOpen] = useState(false);
  // Адрес, введённый пользователем (или пришедший с пикера) — приоритетнее геокода
  const [addressOverride, setAddressOverride] = useState<string | null>(initial.address ?? null);

  // Адрес по координатам: кэшируемый query (по координатам) вместо мутации
  // с ручной дедупликацией; пока грузится — показываем координаты
  const { data: geo, isPending: geoPending } = useReverseGeocode(initial.lat, initial.lng, !initial.address);
  const shownAddress = addressOverride ?? geo?.address ?? formatLatLng(lat, lng);

  const patchDraft = (patch: Partial<PlaceDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if ("address" in patch) setAddressOverride(patch.address ?? null);
  };

  const submit = async () => {
    if (!draft.name.trim()) {
      toast.error("Введите название места");
      return;
    }
    if (!draft.dayId) {
      toast.error("Выберите день");
      return;
    }
    try {
      await create.mutateAsync({
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        category: draft.category,
        lat,
        lng,
        dayId: draft.dayId,
        timeOfDay: draft.timeOfDay || undefined,
        budget: parseBudget(draft.budget) ?? undefined,
        address: shownAddress.trim() || undefined,
      });
      toast.success("Место добавлено! 📍");
      onDone();
    } catch (err) {
      toast.error("Не удалось добавить место", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* координаты */}
      <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
        <MapPin className="size-3 shrink-0" />
        {geoPending ? (
          <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Определяем адрес…</span>
        ) : (
          <span className="truncate">{shownAddress}</span>
        )}
      </div>

      <PlaceForm value={draft} onChange={patchDraft} />

      {/* день создания — только в этой форме */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День *</label>
        <select
          value={draft.dayId}
          onChange={(e) => patchDraft({ dayId: e.target.value })}
          className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm"
        >
          <option value="">Выбрать…</option>
          {days?.map((d) => (
            <option key={d.id} value={d.id}>День {d.dayNumber} · {d.city}</option>
          ))}
        </select>
      </div>

      {/* кнопка карты — уточнить точку */}
      <div>
        <div className="text-xs text-muted-foreground mb-1 block">Точка на карте</div>
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="w-full min-h-11 rounded-lg bg-secondary border border-border hover:bg-accent flex items-center justify-center gap-1.5 text-sm"
        >
          <MapIcon className="size-4" /> Выбрать на карте
        </button>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg bg-secondary py-2.5 min-h-11 text-sm font-medium"
        >
          Отмена
        </button>
        <button
          onClick={submit}
          disabled={create.isPending || !draft.name.trim() || !draft.dayId}
          className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 min-h-11 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {create.isPending ? "…" : "Добавить"}
        </button>
      </div>

      <MapPicker
        open={mapOpen}
        onOpenChange={setMapOpen}
        initialLat={lat}
        initialLng={lng}
        onPick={(r) => {
          setLat(r.lat);
          setLng(r.lng);
          patchDraft({ address: r.address });
        }}
      />
    </div>
  );
}
