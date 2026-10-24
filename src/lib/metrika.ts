// Цели Яндекс.Метрики из клиентского кода. Счётчик подключает серверный
// компонент YandexMetrika и кладёт его номер в window.ymCounterId; без счётчика
// (dev, нет переменной, скрипт заблокирован) всё молча не делает ничего.

type Ym = (counterId: number, method: string, goal: string, params?: object, callback?: () => void) => void;
type MetrikaWindow = { ym?: Ym; ymCounterId?: number };

// Если Метрика не отозвалась (блокировщик, сеть), не держим пользователя дольше этого
const CALLBACK_FALLBACK_MS = 500;

/**
 * Отправить цель и вызвать done: сразу, если счётчика нет, иначе — когда Метрика
 * приняла событие (или по таймеру). Нужно перед уходом со страницы: переход
 * сразу после reachGoal обрывает запрос, и цель теряется. done вызывается один раз.
 */
export function reachGoal(goal: string, done?: () => void): void {
  let called = false;
  const finish = () => {
    if (called) return;
    called = true;
    done?.();
  };

  const w = (typeof window === "undefined" ? undefined : window) as MetrikaWindow | undefined;
  if (!w || typeof w.ym !== "function" || typeof w.ymCounterId !== "number") return finish();

  try {
    w.ym(w.ymCounterId, "reachGoal", goal, {}, finish);
    setTimeout(finish, CALLBACK_FALLBACK_MS);
  } catch {
    finish();
  }
}
