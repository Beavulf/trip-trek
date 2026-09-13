"use client";

// Герой-карточка пустого состояния (оранжевый градиент + CTA).
// Раньше копировалась в trip-map, itinerary и timeline с расхождением текстов.
// Фаза 6 углубления карты.
export function EmptyHero({
  emoji,
  title,
  text,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  text: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="space-y-4 animate-fade-up pb-20">
      <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl text-center">
        <div className="text-5xl mb-3">{emoji}</div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-white/80 text-sm mt-1">{text}</p>
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
