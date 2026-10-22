// Последовательное выполнение задач с одним ключом (в пределах процесса).
// Сервер — один bun-процесс (ADR-0001), поэтому in-memory очередь по ключу
// закрывает гонку «проверил — создал» без уникального индекса в БД и миграции.
const tails = new Map<string, Promise<void>>();

export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  // хвост никогда не отклоняется: ошибка fn уходит вызывающему, а не следующему в очереди
  const tail = prev.then(() => mine);
  tails.set(key, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}
