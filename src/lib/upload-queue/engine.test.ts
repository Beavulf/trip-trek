import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { UploadEngine } from "./engine";
import { createMemoryStore } from "./memory-store";
import type { DrainSummary, JobMeta, Prepared, UploadOutcome, UploadRequest } from "./types";

// Блоб/Файл в node-env есть (Node ≥ 20), содержимое тестам не важно
const blob = (n = 4) => new Blob([new Uint8Array(n)]);
const file = (name: string) => new File([new Uint8Array(4)], name, { type: "image/jpeg" });

interface Harness {
  engine: UploadEngine;
  store: ReturnType<typeof createMemoryStore>;
  uploads: UploadRequest[];
  uploaded: JobMeta[];
  drains: DrainSummary[];
  gone: string[];
  online: { value: boolean };
  /** Следующие исходы отправки по порядку; когда кончились — ok */
  script: UploadOutcome[];
  /** Если задан, отправка ждёт этот промис (ручное завершение) */
  gate: { current: Promise<void> | null };
  known: Set<string>;
  prepare: (f: File) => Promise<Prepared>;
}

function setup(opts?: { prepare?: (f: File) => Promise<Prepared>; store?: ReturnType<typeof createMemoryStore> }): Harness {
  const store = opts?.store ?? createMemoryStore();
  const uploads: UploadRequest[] = [];
  const uploaded: JobMeta[] = [];
  const drains: DrainSummary[] = [];
  const gone: string[] = [];
  const online = { value: true };
  const script: UploadOutcome[] = [];
  const gate: { current: Promise<void> | null } = { current: null };
  const known = new Set<string>();
  const prepare =
    opts?.prepare ??
    (async (f: File): Promise<Prepared> => ({
      file: blob(),
      thumb: blob(2),
      coords: null,
      takenAt: null,
      // имя файла = отпечаток: одинаковые имена в тестах — «один и тот же кадр»
      hash: f.name,
    }));
  const engine = new UploadEngine({
    store,
    prepare,
    upload: async (req) => {
      uploads.push(req);
      if (gate.current) await gate.current;
      if (req.signal.aborted) return { kind: "aborted" };
      return script.shift() ?? { kind: "ok", photo: { id: `p-${uploads.length}` } };
    },
    onUploaded: (meta) => uploaded.push(meta),
    onDrain: (s) => drains.push(s),
    onJobGone: (id) => gone.push(id),
    isKnownHash: (_trip, hash) => known.has(hash),
    isOnline: () => online.value,
    random: () => 0.5,
  });
  return { engine, store, uploads, uploaded, drains, gone, online, script, gate, known, prepare };
}

const resolveDay = () => "day-1";

/** Дать микрозадачам и таймерам отработать */
const settle = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("конвейер: подготовка → отправка", () => {
  it("кадры готовятся, после commit уходят в день из резолвера, очередь дренится", async () => {
    const h = setup();
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg"), file("b.jpg"), file("c.jpg")] });
    await settle();
    expect(h.engine.getSnapshot().jobs.every((j) => j.status === "ready" && !j.committed)).toBe(true);
    expect(h.uploads).toHaveLength(0); // без commit ничего не уходит

    const r = h.engine.commit(batch, resolveDay);
    expect(r).toEqual({ queued: 3, skipped: 0 });
    await settle(50);

    expect(h.uploads).toHaveLength(3);
    expect(h.uploads.every((u) => u.job.dayId === "day-1" && u.job.tripId === "t1")).toBe(true);
    expect(h.uploaded).toHaveLength(3);
    expect(h.engine.getSnapshot().jobs).toHaveLength(0);
    expect(h.drains).toEqual([{ done: 3, failed: 0, total: 3 }]);
    expect(h.store.size()).toBe(0);
  });

  it("commit до окончания подготовки: недоготовленные подхватываются конвейером", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const h = setup({
      prepare: async (f) => {
        if (f.name === "slow.jpg") await slow;
        return { file: blob(), thumb: null, coords: null, takenAt: null, hash: f.name };
      },
    });
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("fast.jpg"), file("slow.jpg")] });
    await settle();
    h.engine.commit(batch, resolveDay);
    await settle(50);
    expect(h.uploads.map((u) => u.job.name)).toEqual(["fast.jpg"]); // быстрый уже ушёл

    release();
    await settle(50);
    expect(h.uploads.map((u) => u.job.name)).toEqual(["fast.jpg", "slow.jpg"]);
    expect(h.drains).toHaveLength(1);
  });

  it("подготовка идёт не более prepareConcurrency кадров одновременно", async () => {
    let active = 0;
    let peak = 0;
    const h = setup({
      prepare: async (f) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return { file: blob(), thumb: null, coords: null, takenAt: null, hash: f.name };
      },
    });
    await h.engine.init("u1");
    h.engine.stage({ userId: "u1", tripId: "t1", files: Array.from({ length: 8 }, (_, i) => file(`${i}.jpg`)) });
    await settle(200);
    expect(peak).toBe(2);
    expect(h.engine.getSnapshot().stats.staged).toBe(8);
  });

  it("отправка идёт не более uploadConcurrency кадров одновременно", async () => {
    const h = setup();
    let release!: () => void;
    h.gate.current = new Promise<void>((r) => (release = r));
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: Array.from({ length: 7 }, (_, i) => file(`${i}.jpg`)) });
    await settle();
    h.engine.commit(batch, resolveDay);
    await settle();
    expect(h.engine.getSnapshot().stats.uploading).toBe(3);
    release();
    h.gate.current = null;
    await settle(50);
    expect(h.uploads).toHaveLength(7);
  });
});

describe("дубли", () => {
  it("кадр, уже известный в поездке, помечается дублем и не уходит", async () => {
    const h = setup();
    h.known.add("old.jpg");
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("old.jpg"), file("new.jpg")] });
    await settle();
    const dup = h.engine.getSnapshot().jobs.find((j) => j.name === "old.jpg");
    expect(dup?.status).toBe("duplicate");

    expect(h.engine.commit(batch, resolveDay)).toEqual({ queued: 1, skipped: 1 });
    await settle(50);
    expect(h.uploads.map((u) => u.job.name)).toEqual(["new.jpg"]);
  });

  it("одинаковые кадры внутри выбора: второй — дубль", async () => {
    const h = setup();
    await h.engine.init("u1");
    h.engine.stage({ userId: "u1", tripId: "t1", files: [file("same.jpg"), file("same.jpg")] });
    await settle();
    const statuses = h.engine.getSnapshot().jobs.map((j) => j.status).sort();
    expect(statuses).toEqual(["duplicate", "ready"]);
  });

  it("409 от сервера — успех, а не ошибка (первая попытка могла дойти, ответ потерялся)", async () => {
    const h = setup();
    h.script.push({ kind: "duplicate" });
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    h.engine.commit(batch, resolveDay);
    await settle(50);
    expect(h.engine.getSnapshot().stats.failed).toBe(0);
    expect(h.engine.getSnapshot().jobs).toHaveLength(0);
    expect(h.uploaded).toHaveLength(0); // строки нет — кэш обновит рефетч после дрейна
    expect(h.drains).toEqual([{ done: 1, failed: 0, total: 1 }]);
  });
});

describe("повторы и сбои", () => {
  it("сетевая ошибка повторяется с отступом и в итоге доходит", async () => {
    const h = setup();
    h.script.push({ kind: "retry", message: "boom" }, { kind: "retry", message: "boom" });
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    h.engine.commit(batch, resolveDay);
    await settle(1);
    expect(h.uploads).toHaveLength(1);
    await settle(2_100); // 1-й отступ ~2 c
    expect(h.uploads).toHaveLength(2);
    await settle(4_100); // 2-й отступ ~4 c
    expect(h.uploads).toHaveLength(3);
    expect(h.uploaded).toHaveLength(1);
    expect(h.engine.getSnapshot().stats.failed).toBe(0);
  });

  it("после maxAttempts кадр становится failed, а ручной retry возвращает его в очередь", async () => {
    const h = setup();
    for (let i = 0; i < 6; i++) h.script.push({ kind: "retry", message: "502" });
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    h.engine.commit(batch, resolveDay);
    await settle(200_000);
    const snap = h.engine.getSnapshot();
    expect(snap.stats.failed).toBe(1);
    expect(snap.jobs[0].error).toBe("502");
    expect(h.drains).toEqual([{ done: 0, failed: 1, total: 1 }]);

    h.engine.retryFailed();
    await settle(50);
    expect(h.uploaded).toHaveLength(1);
    expect(h.engine.getSnapshot().jobs).toHaveLength(0);
  });

  it("permanent (415, 403): не повторяем, остаётся failed без права на авто-повтор", async () => {
    const h = setup();
    h.script.push({ kind: "permanent", message: "Недопустимый тип файла" });
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    h.engine.commit(batch, resolveDay);
    await settle(100_000);
    expect(h.uploads).toHaveLength(1);
    const j = h.engine.getSnapshot().jobs[0];
    expect(j.status).toBe("failed");
    expect(j.permanent).toBe(true);

    // возврат из фона permanent-кадр не оживляет
    h.engine.resumedFromBackground();
    await settle(50);
    expect(h.uploads).toHaveLength(1);
  });

  it("офлайн: попытки не списываются, после networkRestored всё уходит без отступа", async () => {
    const h = setup();
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg"), file("b.jpg")] });
    await settle();
    h.online.value = false;
    h.engine.networkLost();
    h.engine.commit(batch, resolveDay);
    await settle(10_000);
    expect(h.uploads).toHaveLength(0);
    expect(h.engine.getSnapshot().pause?.reason).toBe("offline");

    h.online.value = true;
    h.engine.networkRestored();
    await settle(50);
    expect(h.uploaded).toHaveLength(2);
  });

  it("обрыв сети посреди отправки не тратит попытку", async () => {
    const h = setup();
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    let release!: () => void;
    h.gate.current = new Promise<void>((r) => (release = r));
    h.script.push({ kind: "retry", message: "Failed to fetch" });
    h.engine.commit(batch, resolveDay);
    await settle(1);
    h.online.value = false; // сеть пропала, пока запрос был в полёте
    h.gate.current = null;
    release();
    await settle(60_000);
    expect(h.uploads).toHaveLength(1);

    // Сеть вернулась. Пять честных сбоев подряд всё ещё укладываются в шесть попыток —
    // значит, оффлайновый обрыв выше попытку не списал
    for (let i = 0; i < 5; i++) h.script.push({ kind: "retry", message: "502" });
    h.online.value = true;
    h.engine.networkRestored();
    await settle(120_000);
    expect(h.engine.getSnapshot().stats.failed).toBe(0);
    expect(h.uploaded).toHaveLength(1);
  });

  it("429: вся очередь стоит retryAfter, затем продолжает без потерь", async () => {
    const h = setup();
    h.script.push({ kind: "rate", message: "лимит", retryAfterMs: 30_000 });
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg"), file("b.jpg"), file("c.jpg")] });
    await settle();
    h.engine.commit(batch, resolveDay);
    await settle(1);
    expect(h.engine.getSnapshot().pause?.reason).toBe("rate");
    const before = h.uploads.length;
    await settle(20_000);
    expect(h.uploads.length).toBe(before); // стоим
    await settle(11_000);
    expect(h.uploaded).toHaveLength(3);
    expect(h.engine.getSnapshot().stats.failed).toBe(0);
  });

  it("401: пауза до возврата из фона, кадры сохраняются", async () => {
    const h = setup();
    h.script.push({ kind: "auth", message: "Войдите" });
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    h.engine.commit(batch, resolveDay);
    await settle(5_000);
    expect(h.engine.getSnapshot().pause?.reason).toBe("auth");
    expect(h.uploaded).toHaveLength(0);

    h.engine.resumedFromBackground(); // юзер вернулся (вошёл заново)
    await settle(50);
    expect(h.uploaded).toHaveLength(1);
  });

  it("возврат из фона обрывает зависшую загрузку и шлёт кадр заново", async () => {
    const h = setup();
    // первая отправка «заморожена»: висит, пока её не оборвут
    const hang = vi.fn();
    const engine = new UploadEngine({
      store: h.store,
      prepare: h.prepare,
      upload: async (req) => {
        hang(req.job.name);
        if (hang.mock.calls.length === 1) {
          await new Promise<void>((resolve) => req.signal.addEventListener("abort", () => resolve()));
          return { kind: "aborted" };
        }
        return { kind: "ok", photo: {} };
      },
      random: () => 0.5,
    });
    await engine.init("u1");
    const batch = engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    engine.commit(batch, resolveDay);
    await settle(1_000);
    expect(hang).toHaveBeenCalledTimes(1);

    const hiddenAt = Date.now(); // свернули, когда запрос уже висел
    await settle(20_000);
    engine.resumedFromBackground(hiddenAt);
    await settle(50);
    expect(hang).toHaveBeenCalledTimes(2);
    expect(engine.getSnapshot().jobs).toHaveLength(0);
    expect(engine.getSnapshot().stats.failed).toBe(0);
  });
});

describe("пуш друзьям: один на пачку", () => {
  it("silent у всех, кроме последнего отправленного; последний несёт count", async () => {
    const h = setup();
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: Array.from({ length: 5 }, (_, i) => file(`${i}.jpg`)) });
    await settle();
    h.engine.commit(batch, resolveDay);
    await settle(50);
    expect(h.uploads).toHaveLength(5);
    const loud = h.uploads.filter((u) => !u.silent);
    expect(loud).toHaveLength(1);
    expect(loud[0].count).toBe(5);
    expect(h.uploads.filter((u) => u.silent).every((u) => u.count === null)).toBe(true);
  });

  it("одиночный кадр: без silent и без count", async () => {
    const h = setup();
    await h.engine.init("u1");
    h.engine.addPrepared({ userId: "u1", tripId: "t1", dayId: "d1", name: "x.jpg", prepared: { file: blob(), thumb: null, coords: null, takenAt: null, hash: "h" } });
    await settle(50);
    expect(h.uploads[0].silent).toBe(false);
    expect(h.uploads[0].count).toBeNull();
  });
});

describe("переживание закрытия приложения", () => {
  it("подготовленные кадры сохраняются и после «перезапуска» уходят сами", async () => {
    const store = createMemoryStore();
    const first = setup({ store });
    // отправка зависла навсегда — как при убитой вкладке
    const dead = new UploadEngine({
      store,
      prepare: first.prepare,
      upload: () => new Promise<UploadOutcome>(() => {}),
      random: () => 0.5,
    });
    await dead.init("u1");
    const batch = dead.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg"), file("b.jpg")] });
    await settle();
    dead.commit(batch, resolveDay);
    await settle(100);
    expect(store.size()).toBe(2);

    // новый запуск: свежий движок над тем же хранилищем
    const second = setup({ store });
    const restored = await second.engine.init("u1");
    expect(restored).toEqual({ committed: 2, staged: 0 });
    await settle(50);
    expect(second.uploaded.map((m) => m.dayId)).toEqual(["day-1", "day-1"]);
    expect(store.size()).toBe(0);
  });

  it("неотправленный черновик восстанавливается как черновик и сам не уходит", async () => {
    const store = createMemoryStore();
    const a = setup({ store });
    await a.engine.init("u1");
    a.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();

    const b = setup({ store });
    expect(await b.engine.init("u1")).toEqual({ committed: 0, staged: 1 });
    await settle(1_000);
    expect(b.uploads).toHaveLength(0);
    expect(b.engine.getSnapshot().stats.staged).toBe(1);
  });

  it("задания другого пользователя не восстанавливаются и не уходят от чужого имени", async () => {
    const store = createMemoryStore();
    const a = setup({ store });
    await a.engine.init("alice");
    const batch = a.engine.stage({ userId: "alice", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    // «убиваем» приложение Алисы посреди отправки: ответ не придёт никогда
    a.gate.current = new Promise<void>(() => {});
    a.engine.commit(batch, resolveDay);
    await settle(10);

    const bob = setup({ store });
    expect(await bob.engine.init("bob")).toEqual({ committed: 0, staged: 0 });
    await settle(1_000);
    expect(bob.uploads).toHaveLength(0);
    expect(store.size()).toBe(1); // кадр Алисы дождётся Алису
  });

  it("устаревший черновик (старше суток) чистится при запуске", async () => {
    const store = createMemoryStore();
    await store.save(
      {
        id: "old", batchId: "b", userId: "u1", tripId: "t1", dayId: null, name: "old.jpg", committed: false, batchSize: 1,
        coords: null, takenAt: null, hash: "h", caption: null, address: null, status: "ready",
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000, error: null, permanent: false,
      },
      { file: blob(), thumb: null }
    );
    const h = setup({ store });
    expect(await h.engine.init("u1")).toEqual({ committed: 0, staged: 0 });
    await settle();
    expect(store.size()).toBe(0);
  });

  it("не персистентное хранилище не роняет очередь, а сообщает об этом", async () => {
    const onPersistError = vi.fn();
    const broken = {
      load: async () => [],
      save: async () => {
        throw new Error("QuotaExceededError");
      },
      remove: async () => {},
    };
    const uploaded: JobMeta[] = [];
    const engine = new UploadEngine({
      store: broken,
      prepare: async (f) => ({ file: blob(), thumb: null, coords: null, takenAt: null, hash: f.name }),
      upload: async () => ({ kind: "ok", photo: {} }),
      onUploaded: (m) => uploaded.push(m),
      onPersistError,
    });
    await engine.init("u1");
    const batch = engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    engine.commit(batch, resolveDay);
    await settle(50);
    expect(onPersistError).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().persistent).toBe(false);
    expect(uploaded).toHaveLength(1);
  });
});

describe("управление очередью", () => {
  it("discard убирает черновик и освобождает превью", async () => {
    const h = setup();
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg"), file("b.jpg")] });
    await settle();
    expect(h.store.size()).toBe(2); // подготовленные кадры уже лежат на диске
    h.engine.discard(batch);
    expect(h.engine.getSnapshot().jobs).toHaveLength(0);
    expect(h.gone).toHaveLength(2);
    await settle(); // удаление из хранилища идёт через цепочку записей
    expect(h.store.size()).toBe(0);
  });

  it("cancelPending прерывает идущую отправку и очищает прогресс", async () => {
    const h = setup();
    h.gate.current = new Promise<void>(() => {});
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg"), file("b.jpg")] });
    await settle();
    h.engine.commit(batch, resolveDay);
    await settle(10);
    expect(h.engine.getSnapshot().stats.sessionTotal).toBe(2);
    h.engine.cancelPending();
    const snap = h.engine.getSnapshot();
    expect(snap.jobs).toHaveLength(0);
    expect(snap.stats.sessionTotal).toBe(0);
    expect(snap.active).toBe(false);
  });

  it("пауза пользователя останавливает старт новых отправок, resume продолжает", async () => {
    const h = setup();
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    h.engine.setUserPaused(true);
    h.engine.commit(batch, resolveDay);
    await settle(1_000);
    expect(h.uploads).toHaveLength(0);
    expect(h.engine.getSnapshot().pause?.reason).toBe("user");
    h.engine.setUserPaused(false);
    await settle(50);
    expect(h.uploaded).toHaveLength(1);
  });

  it("ошибка подготовки (HEIC) не валит остальные и не уходит в очередь", async () => {
    const h = setup({
      prepare: async (f) => {
        if (f.name === "bad.heic") throw new Error("HEIC не поддерживается");
        return { file: blob(), thumb: null, coords: null, takenAt: null, hash: f.name };
      },
    });
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("bad.heic"), file("ok.jpg")] });
    await settle();
    const bad = h.engine.getSnapshot().jobs.find((j) => j.name === "bad.heic");
    expect(bad).toMatchObject({ status: "failed", error: "HEIC не поддерживается", canRetry: false });
    expect(h.engine.commit(batch, resolveDay)).toEqual({ queued: 1, skipped: 1 });
    await settle(50);
    expect(h.uploads.map((u) => u.job.name)).toEqual(["ok.jpg"]);
  });

  it("день не определился (пустой резолвер) — кадр failed, а не тихая потеря", async () => {
    const h = setup();
    await h.engine.init("u1");
    const batch = h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    h.engine.commit(batch, () => null);
    await settle(50);
    expect(h.uploads).toHaveLength(0);
    expect(h.engine.getSnapshot().jobs[0]).toMatchObject({ status: "failed", permanent: true });
  });
});

describe("снимок для UI", () => {
  it("getSnapshot стабилен между изменениями, а stats переиспользуется при равных числах", async () => {
    const h = setup();
    await h.engine.init("u1");
    const s0 = h.engine.getSnapshot();
    expect(h.engine.getSnapshot()).toBe(s0);

    h.engine.stage({ userId: "u1", tripId: "t1", files: [file("a.jpg")] });
    await settle();
    const s1 = h.engine.getSnapshot();
    expect(s1).not.toBe(s0);
    expect(s1.stats.staged).toBe(1);

    // изменение, не трогающее счётчики, даёт новый снимок, но тот же объект stats —
    // подписчики на stats (FAB) не перерисовываются зря
    h.engine.setUserPaused(true);
    const s2 = h.engine.getSnapshot();
    expect(s2).not.toBe(s1);
    expect(s2.stats).toBe(s1.stats);
    expect(s2.pause?.reason).toBe("user");
  });

  it("подписчики уведомляются не чаще раза в 100 мс на потоке мелких изменений", async () => {
    const h = setup();
    const cb = vi.fn();
    h.engine.subscribe(cb);
    await h.engine.init("u1");
    cb.mockClear();
    h.engine.stage({ userId: "u1", tripId: "t1", files: Array.from({ length: 30 }, (_, i) => file(`${i}.jpg`)) });
    await settle(1_000);
    // 1 немедленное уведомление на stage + по ≤1 на каждые 100 мс подготовки
    expect(cb.mock.calls.length).toBeLessThanOrEqual(5);
  });
});
