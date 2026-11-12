// Пачка мутаций галереи: ограниченная параллельность (сотни последовательных
// запросов медленно, неограниченных — шквал), итог делится на сделанные/упавшие.
export interface BulkResult {
  done: string[];
  failed: string[];
}

export async function runBulk(
  ids: string[],
  worker: (id: string) => Promise<unknown>,
  limit = 4,
): Promise<BulkResult> {
  const done: string[] = [];
  const failed: string[] = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, ids.length) }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        await worker(id);
        done.push(id);
      } catch {
        failed.push(id);
      }
    }
  });
  await Promise.all(runners);
  return { done, failed };
}
