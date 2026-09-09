"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, Flame, ImageIcon, Loader2, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import {
  parseWantedBy,
  useAddFood,
  useDeleteFood,
  useUpdateFood,
  useUploadFoodPhoto,
  type FoodEditPayload,
  type FoodItem,
} from "@/hooks/use-trip";
import { FOOD_EMOJIS, type ParticipantLite } from "./shared";

interface FoodSheetProps {
  food: FoodItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Города из маршрута — быстрые чипсы для поля «Город» */
  dayCities: string[];
  participants: ParticipantLite[];
  currentUserId: string;
  /** Символ валюты поездки для плейсхолдера цены */
  priceSym: string;
}

/**
 * Шторка блюда: просмотр + редактирование всех полей, фото, рейтинг,
 * голоса «хочу попробовать», удаление с возвратом.
 */
export function FoodSheet({ food, open, onOpenChange, dayCities, participants, currentUserId, priceSym }: FoodSheetProps) {
  const update = useUpdateFood();
  const upload = useUploadFoodPhoto();
  const del = useDeleteFood();
  const addFood = useAddFood();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Форма редактирования
  const [name, setName] = useState("");
  const [nameCn, setNameCn] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [place, setPlace] = useState("");
  const [price, setPrice] = useState("");
  const [emoji, setEmoji] = useState("🍽️");

  // Пересобираем форму при открытии и при смене блюда
  useEffect(() => {
    if (!open || !food) return;
    setName(food.name);
    setNameCn(food.nameCn ?? "");
    setDescription(food.description ?? "");
    setCity(food.city);
    setPlace(food.place ?? "");
    setPrice(food.price ?? "");
    setEmoji(food.emoji || "🍽️");
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, food?.id]);

  if (!open || !food) return null;

  const pending = update.isPending || upload.isPending || del.isPending;

  const dirty =
    name.trim() !== food.name ||
    (nameCn.trim() || null) !== food.nameCn ||
    description.trim() !== (food.description ?? "") ||
    city.trim() !== food.city ||
    (place.trim() || null) !== food.place ||
    (price.trim() || null) !== food.price ||
    emoji !== (food.emoji || "🍽️");

  const save = async () => {
    if (!name.trim() || !city.trim()) {
      toast.error("Название и город обязательны");
      return;
    }
    const data: FoodEditPayload = {};
    if (name.trim() !== food.name) data.name = name.trim();
    if ((nameCn.trim() || null) !== food.nameCn) data.nameCn = nameCn.trim() || null;
    if (description.trim() !== (food.description ?? "")) data.description = description.trim();
    if (city.trim() !== food.city) data.city = city.trim();
    if ((place.trim() || null) !== food.place) data.place = place.trim() || null;
    if ((price.trim() || null) !== food.price) data.price = price.trim() || null;
    if (emoji !== (food.emoji || "🍽️")) data.emoji = emoji;
    if (Object.keys(data).length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      await update.mutateAsync({ id: food.id, ...data });
      toast.success("Сохранено");
      onOpenChange(false);
    } catch (e) {
      toast.error("Не удалось сохранить", {
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    }
  };

  const toggleTried = () => {
    update.mutate(
      { id: food.id, tried: !food.tried },
      {
        onSuccess: () => {
          toast(food.tried ? "Убрано из попробованных" : "Отмечено как попробованное! 🍽️", {
            description: food.name,
          });
        },
        onError: (err) => {
          toast.error("Не удалось обновить", {
            description: err instanceof Error ? err.message : "Попробуйте ещё раз",
          });
        },
      }
    );
  };

  const setRating = (s: number) => {
    update.mutate(
      { id: food.id, rating: s === food.rating ? null : s },
      {
        onError: (err) => {
          toast.error("Не удалось сохранить оценку", {
            description: err instanceof Error ? err.message : "Попробуйте ещё раз",
          });
        },
      }
    );
  };

  // Голоса «хочу попробовать»
  const voters = parseWantedBy(food);
  const iWant = !!currentUserId && voters.includes(currentUserId);
  const toggleWant = () => {
    if (!currentUserId) return;
    update.mutate(
      { id: food.id, want: !iWant },
      {
        onError: (err) => {
          toast.error("Не удалось проголосовать", {
            description: err instanceof Error ? err.message : "Попробуйте ещё раз",
          });
        },
      }
    );
  };

  const participantById = new Map(participants.map((p) => [p.id, p]));

  const onFile = async (f: File) => {
    try {
      await upload.mutateAsync({ id: food.id, file: f });
      toast.success("Фото блюда добавлено 📸");
    } catch (err) {
      toast.error("Не удалось загрузить фото", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  const removePhoto = async () => {
    try {
      await update.mutateAsync({ id: food.id, imageUrl: null });
      toast.success("Фото убрано");
    } catch (err) {
      toast.error("Не удалось убрать фото", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  // Удаление с возвратом: снимок полей уезжает в тост (включая отметку, оценку и фото)
  const handleDelete = async () => {
    const wantedBy = parseWantedBy(food);
    const snapshot = {
      name: food.name,
      nameCn: food.nameCn ?? undefined,
      description: food.description,
      city: food.city,
      place: food.place ?? undefined,
      price: food.price ?? undefined,
      emoji: food.emoji ?? undefined,
      tried: food.tried,
      rating: food.rating,
      imageUrl: food.imageUrl ?? undefined,
    };
    try {
      await del.mutateAsync(food.id);
      onOpenChange(false);
      // duration 8с — читаем описание и успеваем нажать «Вернуть»
      toast("Блюдо удалено", {
        description: snapshot.name,
        duration: 8000,
        action: {
          label: "Вернуть",
          onClick: () => {
            addFood.mutate(snapshot, {
              onSuccess: (restored) => {
                toast.success(`${snapshot.name} вернулось в меню`);
                if (typeof restored?.id === "string") {
                  const patch: FoodEditPayload & { id: string } = { id: restored.id };
                  if (snapshot.tried) patch.tried = true;
                  if (snapshot.rating != null) patch.rating = snapshot.rating;
                  if (snapshot.imageUrl) patch.imageUrl = snapshot.imageUrl;
                  // Голоса других участников восстановить нельзя (сервер принимает только
                  // свой голос) — возвращаем как минимум мой
                  if (wantedBy.includes(currentUserId) && currentUserId) patch.want = true;
                  if (Object.keys(patch).length > 1) update.mutate(patch);
                }
              },
              onError: (err) =>
                toast.error("Не удалось вернуть", {
                  description: err instanceof Error ? err.message : "Попробуйте ещё раз",
                }),
            });
          },
        },
      });
    } catch (err) {
      toast.error("Не удалось удалить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  return (
    <>
      <MobileBottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={food.name}
        titleIcon={<span className="text-lg">{food.emoji || "🍽️"}</span>}
      >
        <div className="space-y-4">
          {/* Фото */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Сброс значения: повторный выбор того же файла должен снова вызвать onChange
                e.target.value = "";
                if (f) onFile(f);
              }}
            />
            {food.imageUrl ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setLightbox(true)}
                  aria-label="Открыть фото"
                  className="block w-full overflow-hidden rounded-2xl"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={food.imageUrl} alt={food.name} className="h-44 w-full object-cover" />
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={pending}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-medium min-h-11 active:scale-[0.98] disabled:opacity-50"
                  >
                    {upload.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                    Заменить
                  </button>
                  <button
                    type="button"
                    onClick={removePhoto}
                    disabled={pending}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-medium text-red-500 min-h-11 active:scale-[0.98] disabled:opacity-50"
                  >
                    <ImageIcon className="size-3.5" />
                    Убрать
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={pending}
                aria-label="Добавить фото блюда"
                className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary hover:text-primary min-h-11 active:scale-[0.99] disabled:opacity-50"
              >
                {upload.isPending ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : (
                  <>
                    <Camera className="size-6" />
                    <span className="text-xs font-medium">Сфотографировать блюдо</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Статус: попробовали? */}
          <div>
            <div className="mb-1.5 text-xs text-muted-foreground">Статус</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => food.tried && toggleTried()}
                disabled={pending}
                aria-pressed={!food.tried}
                className={cn(
                  "min-h-11 rounded-xl text-xs font-medium transition-colors",
                  !food.tried ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "bg-muted text-muted-foreground"
                )}
              >
                ⏳ Попробовать
              </button>
              <button
                type="button"
                onClick={() => !food.tried && toggleTried()}
                disabled={pending}
                aria-pressed={food.tried}
                className={cn(
                  "min-h-11 rounded-xl text-xs font-medium transition-colors",
                  food.tried ? "bg-green-500/15 text-green-600 ring-1 ring-green-500/40" : "bg-muted text-muted-foreground"
                )}
              >
                ✓ Попробовали
              </button>
            </div>
          </div>

          {/* Рейтинг — только для попробованных */}
          {food.tried && (
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Оценка вкуса</div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    disabled={pending}
                    aria-label={`Оценить на ${s} из 5`}
                    className="min-h-11 min-w-11 grid place-items-center p-1 active:scale-90 transition-transform disabled:opacity-50"
                  >
                    <Star
                      className={cn(
                        "size-8 transition-transform",
                        (food.rating ?? 0) >= s ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                      )}
                    />
                  </button>
                ))}
                {food.rating && (
                  <span className="ml-1 text-sm font-semibold tabular-nums text-amber-500">{food.rating}/5</span>
                )}
              </div>
            </div>
          )}

          {/* Голоса «хочу попробовать» — для непопробованных */}
          {!food.tried && (
            <div className="rounded-2xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Flame className="size-4 shrink-0 text-orange-500" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">
                      {voters.length === 0
                        ? "Никто не голосовал"
                        : `Хотят попробовать: ${voters.length}`}
                    </div>
                    {voters.length > 0 && (
                      <div className="mt-1 flex items-center gap-1">
                        {voters.slice(0, 5).map((v) => {
                          const p = participantById.get(v);
                          return (
                            <span
                              key={v}
                              title={p?.name ?? "Участник"}
                              className="grid size-6 place-items-center rounded-full text-[11px] ring-2 ring-background"
                              style={{ background: `${p?.color ?? "#94a3b8"}33` }}
                            >
                              {p?.emoji ?? "👤"}
                            </span>
                          );
                        })}
                        {voters.length > 5 && (
                          <span className="text-[11px] text-muted-foreground">+{voters.length - 5}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {currentUserId && (
                  <button
                    type="button"
                    onClick={toggleWant}
                    disabled={pending}
                    aria-pressed={iWant}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition-all min-h-11 active:scale-95 disabled:opacity-50",
                      iWant ? "bg-orange-500 text-white shadow-md" : "border border-orange-500/50 text-orange-500"
                    )}
                  >
                    {iWant ? <Check className="size-3.5" /> : <Flame className="size-3.5" />}
                    {iWant ? "Я хочу" : "Хочу!"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Поля редактирования */}
          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Название *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Пельмени"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Оригинальное название</label>
              <input
                value={nameCn}
                onChange={(e) => setNameCn(e.target.value)}
                placeholder="На местном языке"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Город *</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Город"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
              />
              {dayCities.length > 0 && (
                <div className="chip-rail no-scrollbar mt-2">
                  {dayCities.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCity(c)}
                      aria-label={`Город ${c}`}
                      className={cn(
                        "min-h-9 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        city === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Где попробовать</label>
                <input
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="Ресторан, рынок"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Цена</label>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={`напр. ${priceSym}25–40`}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Описание</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Что это, вкус, стоит ли пробовать…"
                rows={3}
                className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Иконка</label>
              <div className="chip-rail no-scrollbar">
                {FOOD_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    aria-label={`Иконка ${e}`}
                    aria-pressed={emoji === e}
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-lg text-xl transition-all",
                      emoji === e ? "bg-primary/20 ring-2 ring-primary" : "bg-muted"
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Действия */}
          <div className="flex gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={save}
              disabled={pending || (!dirty && !confirmDelete)}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {update.isPending ? "Сохранение…" : dirty ? "Сохранить" : "Сохранено"}
            </button>
            {confirmDelete ? (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={del.isPending}
                  className="btn-confirm-yes"
                >
                  {del.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
                  {del.isPending ? "…" : "Удалить"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={del.isPending}
                  className="btn-confirm-no"
                >
                  Нет
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Удалить блюдо"
                className="grid size-12 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 min-h-12 min-w-12"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        </div>
      </MobileBottomSheet>

      {/* Лайтбокс фото */}
      {lightbox && food.imageUrl && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/95 p-4"
            onClick={() => setLightbox(false)}
          >
            <button
              className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full bg-white/10 text-white"
              aria-label="Закрыть"
            >
              <X className="size-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={food.imageUrl}
              alt={food.name}
              className="max-h-[75vh] max-w-full rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="mt-4 text-center text-sm font-medium text-white">
              {food.name}
              {food.nameCn && <span className="ml-2 text-white/60">{food.nameCn}</span>}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
