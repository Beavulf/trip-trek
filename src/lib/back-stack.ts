// Менеджер «назад закрывает оверлей»: на телефоне кнопка/жест «назад» в PWA
// без записи в history сразу сворачивает приложение — даже при открытом
// шите/диалоге. Здесь открытие оверлея пушит запись в history, а popstate
// (это и есть нажатие «назад») закрывает верхний оверлей. Когда стек пуст,
// «назад» работает как обычно — выходит из приложения.
//
// Логика вынесена в фабрику с инъекцией history/событий, чтобы гонки
// (клинап в полёте, отложенный push) покрывались юнит-тестом без браузера.

export interface BackStackHistory {
  pushState(state: unknown, title: string): void;
  back(): void;
  readonly state: unknown;
}

export interface BackStackEvents {
  /** Подписка на popstate; возвращает отписку */
  onPopState(cb: () => void): () => void;
}

export interface BackStack {
  /** Зарегистрировать оверлей; возвращает функцию снятия (выозвать при закрытии любым путём) */
  push(close: () => void): () => void;
}

interface Entry {
  close: () => void;
  /** Запись уже ушла в history (таймер отложенного push сработал) */
  pushed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

const KEY = "__ttOverlay";

export function createBackStack(
  history: BackStackHistory,
  events: BackStackEvents
): BackStack {
  const stack: Entry[] = [];
  // popstate от нашего собственного history.back()-клинапа (закрытие через UI)
  // не должен закрывать следующий оверлей — глотаем его
  let skipPop = 0;

  events.onPopState(() => {
    if (skipPop > 0) {
      skipPop -= 1;
      return;
    }
    // Закрываем самый верхний оверлей с записью в history. Записи ещё не
    // отправившиеся (таймер не сработал) пропускаем: их push случится уже
    // после этой навигации и останется валидным.
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i];
      if (!entry.pushed) continue;
      stack.splice(i, 1);
      entry.close();
      return;
    }
  });

  function push(close: () => void): () => void {
    const entry: Entry = { close, pushed: false, timer: null };
    // pushState откладываем в task: соседние «шит закрылся + визард открылся»
    // в одном тике иначе устраивают гонку — back() клинапа уже в полёте,
    // а новый pushState выполняется синхронно раньше самой навигации назад.
    entry.timer = setTimeout(() => {
      entry.timer = null;
      // оверлей успел закрыться до отправки записи — пушить нечего
      if (stack.indexOf(entry) === -1) return;
      entry.pushed = true;
      // state Next.js сохраняем: его роутер читает свои маркеры из history.state
      // и на popstate с чужим state может повести себя непредсказуемо
      const base = (history.state as Record<string, unknown> | null) ?? {};
      history.pushState({ ...base, [KEY]: true }, "");
    }, 0);
    stack.push(entry);

    return () => {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      const idx = stack.indexOf(entry);
      // уже снят обработчиком popstate — повторный клинап не нужен
      if (idx === -1) return;
      stack.splice(idx, 1);
      // Свою запись вычищаем назад, только если она текущая в history
      // (инвариант: текущая наша запись соответствует верхнему pushed-оверлею).
      const cur = history.state as Record<string, unknown> | null;
      if (entry.pushed && cur?.[KEY] === true) {
        skipPop += 1;
        history.back();
      }
    };
  }

  return { push };
}

// Браузерный синглтон. На сервере модуль импортируется при SSR-пререндере
// клиентских компонентов — там окна нет, эффекты не выполняются.
export const backStack: BackStack | null =
  typeof window === "undefined"
    ? null
    : createBackStack(window.history, {
        onPopState(cb) {
          window.addEventListener("popstate", cb);
          return () => window.removeEventListener("popstate", cb);
        },
      });
