import type { JobBlobs, JobMeta, JobStore, StoredJob } from "./types";

/**
 * Хранилище в памяти: запасной вариант, когда IndexedDB недоступна (приватный режим,
 * переполненная квота), и подставка для тестов. Очередь при этом работает, но
 * не переживёт закрытие вкладки.
 */
export function createMemoryStore(): JobStore & { size(): number } {
  const metas = new Map<string, JobMeta>();
  const blobs = new Map<string, JobBlobs>();
  return {
    async load(): Promise<StoredJob[]> {
      const out: StoredJob[] = [];
      for (const [id, meta] of metas) {
        const b = blobs.get(id);
        if (b) out.push({ meta: { ...meta }, blobs: b });
      }
      return out;
    },
    async save(meta, b) {
      metas.set(meta.id, { ...meta });
      if (b) blobs.set(meta.id, b);
    },
    async remove(id) {
      metas.delete(id);
      blobs.delete(id);
    },
    size: () => metas.size,
  };
}
