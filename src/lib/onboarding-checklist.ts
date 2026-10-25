// Список «Первые шаги» на Обзоре. Пункты отмечаются сами по реальным данным поездки —
// обучение делом, а не показом. Чистая функция: данные на входе, пункты на выходе.

import type { StepActionKind, TourRole } from "./onboarding-content";

export interface ChecklistInput {
  role: TourRole | null;
  totalPlaces: number;
  /** Участники поездки, включая вас */
  participants: number;
  totalSpent: number;
  totalPhotos: number;
  /** Можно ли звать друзей (владелец или владелец разрешил участникам) */
  canInvite: boolean;
  /** null — ещё не знаем (профиль грузится); пункт про ИИ тогда не показываем */
  hasAiKey: boolean | null;
}

export interface ChecklistItem {
  id: "trip" | "place" | "friend" | "expense" | "photo" | "ai";
  title: string;
  hint: string;
  done: boolean;
  /** Необязательные пункты не входят в прогресс */
  optional?: boolean;
  /** Куда ведёт кнопка пункта; у выполненных — не нужна */
  action?: StepActionKind;
}

export function buildChecklist(input: ChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { id: "trip", title: "Создать поездку", hint: "Готово — вы уже внутри", done: true },
    {
      id: "place",
      title: "Добавить первое место",
      hint: "На «Маршруте»: день → «Добавить место»",
      done: input.totalPlaces > 0,
      action: "tab:itinerary",
    },
  ];
  if (input.canInvite) {
    items.push({
      id: "friend",
      title: "Позвать друга",
      hint: "Код, ссылка или QR — друг увидит всё сразу",
      done: input.participants > 1,
      action: "invite",
    });
  }
  items.push(
    {
      id: "expense",
      title: "Записать первую трату",
      hint: "Кнопка «+» → «Трата»: долги посчитаются сами",
      done: input.totalSpent > 0,
      action: "quickadd:expense",
    },
    {
      id: "photo",
      title: "Загрузить первое фото",
      hint: "Кнопка «+» → «Фото»: грузится в фоне",
      done: input.totalPhotos > 0,
      action: "quickadd:photo",
    }
  );
  if (input.hasAiKey !== null) {
    items.push({
      id: "ai",
      title: "Подключить ключ ИИ",
      hint: "ИИ подбирает места и пишет рассказы на вашем ключе",
      done: input.hasAiKey,
      optional: true,
      action: "profile-ai",
    });
  }
  return items;
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number; complete: boolean } {
  const required = items.filter((i) => !i.optional);
  const done = required.filter((i) => i.done).length;
  return { done, total: required.length, complete: done === required.length };
}

/** Зрителю список не нужен: он ничего не добавляет */
export function checklistVisible(role: TourRole | null, hidden: boolean): boolean {
  return role !== null && role !== "viewer" && !hidden;
}
