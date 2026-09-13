// Сигнал «покажи это место на карте» между вкладками (галерея, маршрут, диалог).
// Раньше продюсеры писали mapFocusTarget в zustand-стор, а TripMap стирал его
// setTimeout'ом на 50 мс; порядок полётов против fitBounds держался на комментариях
// и уже давал баг (ab2c928 «revert-flight»). Теперь: одна ожидающая цель,
// консюмер (карта) забирает её ровно один раз — ackMapFocus.
// Кандидат №5 аудита 2026-09-12, фаза 4.

export interface MapFocusRequest {
  lat: number;
  lng: number;
  /** Если задан — карта ещё и выбирает место (как тап по маркеру) */
  placeId?: string;
}

let pending: MapFocusRequest | null = null;
const listeners = new Set<() => void>();

/** Продюсер: сфокусировать карту на точке/месте. Цель ждёт, пока карту не потребят. */
export function focusOnMap(req: MapFocusRequest) {
  pending = req; // одна «свежая» цель — новая вытесняет непотреблённую старую
  listeners.forEach((notify) => notify());
}

/** Текущая ожидающая цель (без извлечения). */
export function peekMapFocus(): MapFocusRequest | null {
  return pending;
}

/** Консюмер обработал цель — снять с очереди. Повторный фокус продюсером сработает снова. */
export function ackMapFocus(req: MapFocusRequest) {
  if (pending === req) pending = null;
}

/** Подписка консюмера на появление цели. Ожидающая цель доставляется сразу —
 *  карта обычно монтируется позже продюсера (переключение вкладки). */
export function subscribeMapFocus(notify: () => void): () => void {
  listeners.add(notify);
  if (pending) notify();
  return () => {
    listeners.delete(notify);
  };
}
