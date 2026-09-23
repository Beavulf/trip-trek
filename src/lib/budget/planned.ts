// Планируемые траты маршрута: суммы, которые пользователь указал в полях «бюджет»
// у мест (Place.budget). Чистая функция — покрыта тестами planned.test.ts.
// Считаем в центах (money.ts), чтобы суммы дней не плыли на дробях.
import type { Day } from "../types";
import { CATEGORY_META } from "../types";
import { fromCents, toCents } from "./money";

export interface PlannedDayStat {
  dayId: string;
  dayNumber: number;
  city: string;
  accentColor: string | null;
  /** Планируемая сумма дня по бюджетам мест */
  total: number;
  /** Тот же план в пересчёте на человека */
  perPerson: number;
  /** Сколько мест дня имеют бюджет (из placesCount) */
  withBudget: number;
  placesCount: number;
}

export interface PlannedCategoryStat {
  /** Ключ категории места (Place.category: temple, hotel, …) */
  category: string;
  total: number;
  perPerson: number;
  /** Сколько мест этой категории с бюджетом */
  count: number;
}

export interface PlannedRouteStats {
  /** План на всю поездку */
  total: number;
  perPerson: number;
  days: PlannedDayStat[];
  categories: PlannedCategoryStat[];
  /** Мест без указанного бюджета — чтобы было видно непокрытую часть маршрута */
  unpricedPlaces: number;
}

const hasBudget = (v: number | null | undefined): v is number => v != null && v > 0;

/**
 * План по дням и по категориям мест маршрута. Дни — в исходном порядке
 * (маршрут уже отсортирован по dayNumber), категории — по убыванию суммы.
 */
export function calculatePlannedRoute(days: Day[], participantsCount: number): PlannedRouteStats {
  const people = participantsCount > 0 ? participantsCount : 1;
  const perPersonOf = (cents: number) => Math.round(cents / people);

  const dayStats: PlannedDayStat[] = days.map((d) => {
    let cents = 0;
    let withBudget = 0;
    for (const p of d.places) {
      if (!hasBudget(p.budget)) continue;
      cents += toCents(p.budget);
      withBudget++;
    }
    return {
      dayId: d.id,
      dayNumber: d.dayNumber,
      city: d.city,
      accentColor: d.accentColor,
      total: fromCents(cents),
      perPerson: fromCents(perPersonOf(cents)),
      withBudget,
      placesCount: d.places.length,
    };
  });

  const byCategoryCents = new Map<string, { cents: number; count: number }>();
  let totalCents = 0;
  let unpricedPlaces = 0;
  for (const d of days) {
    for (const p of d.places) {
      if (!hasBudget(p.budget)) {
        unpricedPlaces++;
        continue;
      }
      const cents = toCents(p.budget);
      totalCents += cents;
      const acc = byCategoryCents.get(p.category) ?? { cents: 0, count: 0 };
      acc.cents += cents;
      acc.count += 1;
      byCategoryCents.set(p.category, acc);
    }
  }

  const categories: PlannedCategoryStat[] = [...byCategoryCents.entries()]
    // Категория без меты (придёт из будущего/импорт) — в конец, остальное по убыванию суммы
    .map(([category, acc]) => ({ category, ...acc, known: CATEGORY_META[category] ? 1 : 0 }))
    .sort((a, b) => b.known - a.known || b.cents - a.cents)
    .map(({ category, cents, count }) => ({
      category,
      total: fromCents(cents),
      perPerson: fromCents(perPersonOf(cents)),
      count,
    }));

  return {
    total: fromCents(totalCents),
    perPerson: fromCents(perPersonOf(totalCents)),
    days: dayStats,
    categories,
    unpricedPlaces,
  };
}
