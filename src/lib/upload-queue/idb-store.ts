import { createMemoryStore } from "./memory-store";
import type { JobBlobs, JobMeta, JobStore, StoredJob } from "./types";

// Хранилище очереди в IndexedDB: сжатые кадры (~300 КБ) и метаданные переживают закрытие
// вкладки, свайп приложения из многозадачности и падение браузера. Два object store:
// метаданные правятся часто (статусы), блобы пишутся один раз — не переписываем их зря.

const DB_NAME = "triptrek-upload-queue";
const DB_VERSION = 1;
const META = "jobs";
const BLOBS = "blobs";

type BlobRow = { id: string } & JobBlobs;

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function createIdbStore(): JobStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB недоступна"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "id" });
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: "id" });
      };
      req.onsuccess = () => {
        const db = req.result;
        // обновление версии из другой вкладки / закрытие БД браузером — переоткроем при следующем обращении
        db.onversionchange = () => db.close();
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
      req.onblocked = () => reject(new Error("IndexedDB заблокирована другой вкладкой"));
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
    return dbPromise;
  };

  return {
    async load(): Promise<StoredJob[]> {
      const db = await open();
      const tx = db.transaction([META, BLOBS], "readonly");
      const metas = (await request(tx.objectStore(META).getAll())) as JobMeta[];
      const rows = (await request(tx.objectStore(BLOBS).getAll())) as BlobRow[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const out: StoredJob[] = [];
      for (const meta of metas) {
        const row = byId.get(meta.id);
        // метаданные без блоба (запись оборвалась) для отправки бесполезны
        if (row?.file) out.push({ meta, blobs: { file: row.file, thumb: row.thumb ?? null } });
      }
      return out;
    },

    async save(meta: JobMeta, blobs?: JobBlobs): Promise<void> {
      const db = await open();
      const tx = db.transaction(blobs ? [META, BLOBS] : [META], "readwrite");
      const done = finished(tx);
      tx.objectStore(META).put(meta);
      if (blobs) tx.objectStore(BLOBS).put({ id: meta.id, file: blobs.file, thumb: blobs.thumb } satisfies BlobRow);
      await done;
    },

    async remove(id: string): Promise<void> {
      const db = await open();
      const tx = db.transaction([META, BLOBS], "readwrite");
      const done = finished(tx);
      tx.objectStore(META).delete(id);
      tx.objectStore(BLOBS).delete(id);
      await done;
    },
  };
}

/** IndexedDB, а если её нет (SSR, редкие браузеры) — память: очередь работает, но не переживёт закрытие. */
export function createBestStore(): JobStore {
  return typeof indexedDB === "undefined" ? createMemoryStore() : createIdbStore();
}
