import { backoffMs } from "./classify";
import {
  DEFAULT_ENGINE_CONFIG,
  type DayResolver,
  type EngineConfig,
  type EngineDeps,
  type JobBlobs,
  type JobMeta,
  type JobView,
  type Prepared,
  type QueueSnapshot,
  type QueueStats,
  type StoredJob,
  type UploadOutcome,
} from "./types";

// Фоновая очередь загрузки фото. Живёт в модуле, а не в React-компоненте: раньше
// вся загрузка держалась на смонтированном PhotoBatch, и закрытие шита, смена вкладки
// или падение страницы молча обрывали очередь на середине (ретро 2026-10: «грузил 100
// фото, свернул — часть пропала»).
//
// Принципы:
//  - кадр после подготовки (сжатие, превью, EXIF, sha256) лежит в хранилище вместе с
//    блобом и переживает закрытие приложения; на следующем запуске очередь продолжается;
//  - подготовка и отправка идут конвейером: первые кадры уходят, пока готовятся
//    последние, а не после «обработано 100/100»;
//  - повтор безопасен: сервер дедупит по sha256, а 409 для очереди — успех;
//  - сеть/фон не сжигают попытки: офлайн и прерывания «возврат из фона» не списываются.

const NOTIFY_INTERVAL_MS = 100;
/** Черновик выбора, который юзер так и не отправил, не копим дольше суток */
const STAGED_TTL_MS = 24 * 60 * 60 * 1000;
/** Отправленное, но так и не ушедшее (нет доступа, поездка удалена) — две недели */
const COMMITTED_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface Job extends JobMeta {
  file: Blob | null;
  thumb: Blob | null;
  origin: File | null;
  prepStarted: boolean;
  attempts: number;
  nextAttemptAt: number;
  startedAt: number;
  rev: number;
  /** Учтён в прогрессе текущего сеанса */
  counted: boolean;
  removed: boolean;
  controller: AbortController | null;
}

export function uid(prefix: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  // randomUUID есть только в защищённом контексте — на голом http-стенде падаем на запасной вариант
  const id = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${id}`;
}

const EMPTY_STATS: QueueStats = {
  staged: 0,
  waiting: 0,
  uploading: 0,
  failed: 0,
  sessionTotal: 0,
  sessionDone: 0,
};

export const EMPTY_SNAPSHOT: QueueSnapshot = {
  jobs: [],
  stats: EMPTY_STATS,
  pause: null,
  active: false,
  persistent: true,
};

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export interface StageInput {
  userId: string;
  tripId: string;
  files: readonly File[];
  /** Дописать кадры в существующий черновик выбора */
  batchId?: string;
}

export interface PreparedInput {
  userId: string;
  tripId: string;
  dayId: string;
  name: string;
  prepared: Prepared;
  caption?: string | null;
  address?: string | null;
}

export class UploadEngine {
  private readonly cfg: EngineConfig;
  private readonly jobs = new Map<string, Job>();
  /** batchId → правило выбора дня; только в памяти (у восстановленных заданий день уже выбран) */
  private readonly resolvers = new Map<string, DayResolver>();
  private readonly listeners = new Set<() => void>();
  private readonly viewCache = new Map<string, JobView>();
  private userId: string | null = null;
  private initPromise: Promise<{ committed: number; staged: number }> | null = null;
  private version = 0;
  private cache: { version: number; snap: QueueSnapshot } | null = null;
  private lastStats: QueueStats = EMPTY_STATS;
  private activePrep = 0;
  private authPaused = false;
  private userPaused = false;
  private rateUntil = 0;
  private persistent = true;
  private session = { total: 0, done: 0 };
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private lastNotify = 0;
  private storeChain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: EngineDeps) {
    this.cfg = { ...DEFAULT_ENGINE_CONFIG, ...deps.config };
  }

  // ── подписка для React (useSyncExternalStore) ─────────────────────────────

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = (): QueueSnapshot => {
    if (this.cache && this.cache.version === this.version) return this.cache.snap;
    const snap = this.buildSnapshot();
    this.cache = { version: this.version, snap };
    return snap;
  };

  getThumb(id: string): Blob | null {
    return this.jobs.get(id)?.thumb ?? null;
  }

  /** Кадр с таким отпечатком уже есть в поездке или в очереди — повторно слать не нужно. */
  knows(tripId: string, hash: string | null): boolean {
    return this.hasTwin(tripId, hash);
  }

  private hasTwin(tripId: string, hash: string | null, except?: Job): boolean {
    if (!hash) return false;
    if (this.deps.isKnownHash?.(tripId, hash)) return true;
    for (const o of this.jobs.values()) {
      if (o === except) continue;
      if (o.tripId === tripId && o.hash === hash && o.status !== "duplicate" && o.status !== "failed") return true;
    }
    return false;
  }

  /** Есть отправленное и не завершённое — гейт для beforeunload и подавления WS-рефетчей. */
  hasPending(): boolean {
    for (const j of this.jobs.values()) if (this.isPending(j)) return true;
    return false;
  }

  // ── жизненный цикл ────────────────────────────────────────────────────────

  /**
   * Поднять очередь для пользователя: прочитать хранилище, вернуть число восстановленных
   * заданий. Задания других пользователей не трогаем — они дождутся своего владельца.
   */
  init(userId: string): Promise<{ committed: number; staged: number }> {
    // Повторный вызов (StrictMode, перемонтирование оболочки) получает тот же промис
    if (this.userId === userId && this.initPromise) return this.initPromise;
    if (this.userId && this.userId !== userId) {
      // Смена аккаунта без перезагрузки: чужие кадры выгружаем из памяти, в хранилище они остаются
      for (const j of [...this.jobs.values()]) this.forget(j, false);
      this.session = { total: 0, done: 0 };
    }
    this.userId = userId;
    this.initPromise = this.restore(userId);
    return this.initPromise;
  }

  private async restore(userId: string): Promise<{ committed: number; staged: number }> {
    let stored: StoredJob[] = [];
    try {
      stored = await this.deps.store.load();
    } catch {
      this.markPersistFailed();
    }
    const now = Date.now();
    for (const { meta, blobs } of stored) {
      if (meta.userId !== userId || this.jobs.has(meta.id)) continue;
      const ttl = meta.committed ? COMMITTED_TTL_MS : STAGED_TTL_MS;
      if (now - meta.createdAt > ttl || (meta.status === "failed" && meta.permanent)) {
        this.persist(() => this.deps.store.remove(meta.id));
        continue;
      }
      // uploading после перезапуска = недоотправленный; failed «не насовсем» заслуживает новой попытки
      const job = this.makeJob({ ...meta, status: "ready", error: null, permanent: false }, blobs);
      this.jobs.set(job.id, job);
      if (job.committed) this.enterPending(job);
    }
    this.changed(true);
    this.pump();
    return this.counts();
  }

  /** Добавить кадры в черновик выбора; подготовка стартует сразу. Возвращает id пачки. */
  stage(input: StageInput): string {
    let batchId = input.batchId ?? uid("b");
    if (this.isBatchCommitted(batchId)) batchId = uid("b");
    const now = Date.now();
    input.files.forEach((file, i) => {
      const job = this.makeJob({
        id: uid("j"),
        batchId,
        userId: input.userId,
        tripId: input.tripId,
        dayId: null,
        name: file.name || `photo-${i + 1}.jpg`,
        committed: false,
        batchSize: 1,
        coords: null,
        takenAt: null,
        hash: null,
        caption: null,
        address: null,
        status: "preparing",
        createdAt: now,
        error: null,
        permanent: false,
      });
      job.origin = file;
      this.jobs.set(job.id, job);
    });
    this.changed(true);
    this.pumpPrepare();
    return batchId;
  }

  /** Одиночный кадр из формы: уже подготовлен и подтверждён — сразу в очередь отправки. */
  addPrepared(input: PreparedInput): string {
    const p = input.prepared;
    const job = this.makeJob(
      {
        id: uid("j"),
        batchId: uid("b"),
        userId: input.userId,
        tripId: input.tripId,
        dayId: input.dayId,
        name: input.name,
        committed: true,
        batchSize: 1,
        coords: p.coords,
        takenAt: p.takenAt,
        hash: p.hash,
        caption: input.caption?.trim() || null,
        address: input.address ?? null,
        status: "ready",
        createdAt: Date.now(),
        error: null,
        permanent: false,
      },
      { file: p.file, thumb: p.thumb }
    );
    this.jobs.set(job.id, job);
    this.enterPending(job);
    this.persistFull(job);
    this.changed(true);
    this.pump();
    return job.id;
  }

  /**
   * «Загрузить»: черновик пачки уходит в очередь. Дубли и кадры, не прошедшие подготовку,
   * отбрасываются. Кадры, которые ещё готовятся, подхватятся конвейером по мере готовности.
   */
  commit(batchId: string, resolveDay: DayResolver): { queued: number; skipped: number } {
    const batch = [...this.jobs.values()].filter((j) => j.batchId === batchId && !j.committed);
    let skipped = 0;
    const keep: Job[] = [];
    for (const j of batch) {
      if (j.status === "duplicate" || (j.status === "failed" && !j.file)) {
        skipped++;
        this.forget(j);
        continue;
      }
      keep.push(j);
    }
    if (!keep.length) {
      this.changed(true);
      return { queued: 0, skipped };
    }
    this.resolvers.set(batchId, resolveDay);
    for (const j of keep) {
      j.committed = true;
      j.batchSize = keep.length;
      this.enterPending(j);
      if (j.status === "ready") {
        this.assignDay(j);
        this.persistMeta(j);
      }
      this.touch(j);
    }
    this.changed(true);
    this.pump();
    return { queued: keep.length, skipped };
  }

  /** Выбросить черновик пачки (подготовка прерывается, блобы чистятся). */
  discard(batchId: string): void {
    for (const j of [...this.jobs.values()]) {
      if (j.batchId === batchId && !j.committed) this.cancel(j);
    }
    this.changed(true);
  }

  remove(id: string): void {
    const j = this.jobs.get(id);
    if (!j) return;
    this.cancel(j);
    this.changed(true);
    this.pump();
    this.checkDrain();
  }

  /** «Отменить всё»: убрать из очереди всё отправленное, в полёте — прервать. */
  cancelPending(): void {
    for (const j of [...this.jobs.values()]) if (j.committed) this.cancel(j);
    this.changed(true);
    this.checkDrain();
  }

  /** Повторить упавшие кадры, у которых остался блоб. */
  retryFailed(): void {
    this.authPaused = false;
    this.rateUntil = 0;
    for (const j of this.jobs.values()) this.revive(j);
    this.changed(true);
    this.pump();
  }

  retry(id: string): void {
    const j = this.jobs.get(id);
    if (!j) return;
    this.authPaused = false;
    this.revive(j);
    this.changed(true);
    this.pump();
  }

  setUserPaused(paused: boolean): void {
    if (this.userPaused === paused) return;
    this.userPaused = paused;
    this.changed(true);
    if (!paused) this.pump();
  }

  /** Связь вернулась (событие online / пинг): ждавшие кадры стартуют без отступа. */
  networkRestored(): void {
    this.kick();
    this.changed(true);
    this.pump();
  }

  /** Связь пропала: новые отправки не стартуют, идущие дойдут сами или упадут. */
  networkLost(): void {
    this.changed(true);
  }

  /**
   * Приложение вернулось из фона (hiddenAt — когда его свернули). Мобильный браузер мог
   * заморозить вкладку посреди запроса: такая загрузка «висит» и не завершается. Всё, что
   * стартовало до сворачивания и ещё не закончилось, рвём и шлём заново — повтор безопасен
   * (дедуп по sha256), а ждать таймаута вхолостую незачем.
   */
  resumedFromBackground(hiddenAt: number = Date.now()): void {
    for (const j of this.jobs.values()) {
      if (j.status === "uploading" && j.startedAt <= hiddenAt) j.controller?.abort();
    }
    this.authPaused = false;
    this.kick();
    this.changed(true);
    this.pump();
  }

  // ── подготовка (конвейер сжатия) ──────────────────────────────────────────

  private pumpPrepare(): void {
    while (this.activePrep < this.cfg.prepareConcurrency) {
      let next: Job | null = null;
      for (const j of this.jobs.values()) {
        if (j.status === "preparing" && !j.prepStarted && j.origin && !j.removed) {
          next = j;
          break;
        }
      }
      if (!next) return;
      next.prepStarted = true;
      this.activePrep++;
      void this.runPrepare(next).finally(() => {
        this.activePrep--;
        this.pumpPrepare();
      });
    }
  }

  private async runPrepare(job: Job): Promise<void> {
    const origin = job.origin;
    if (!origin) return;
    let prepared: Prepared;
    try {
      prepared = await this.deps.prepare(origin);
    } catch (e) {
      if (job.removed) return;
      job.origin = null;
      job.status = "failed";
      job.permanent = true;
      job.error = errorMessage(e, "Не удалось обработать фото");
      this.touch(job);
      this.changed();
      if (job.committed) this.checkDrain();
      return;
    }
    if (job.removed) return;
    job.origin = null;
    job.thumb = prepared.thumb;
    job.coords = prepared.coords;
    job.takenAt = prepared.takenAt;
    job.hash = prepared.hash;
    if (this.hasTwin(job.tripId, job.hash, job)) {
      // дубль: превью оставляем для сетки, сам кадр не нужен
      job.status = "duplicate";
      job.file = null;
      if (job.committed) {
        // подтверждён до окончания подготовки — дубль молча уходит из очереди
        this.cancel(job);
      }
    } else {
      job.file = prepared.file;
      job.status = "ready";
      if (job.committed) this.assignDay(job);
      this.persistFull(job);
    }
    this.touch(job);
    this.changed();
    this.pump();
    if (job.committed) this.checkDrain();
  }

  // ── отправка ──────────────────────────────────────────────────────────────

  private canUpload(now: number): boolean {
    return !this.authPaused && !this.userPaused && this.online() && now >= this.rateUntil;
  }

  private online(): boolean {
    return this.deps.isOnline ? this.deps.isOnline() : true;
  }

  private pump(): void {
    const now = Date.now();
    if (this.canUpload(now)) {
      let active = 0;
      for (const j of this.jobs.values()) if (j.status === "uploading") active++;
      for (const j of this.jobs.values()) {
        if (active >= this.cfg.uploadConcurrency) break;
        if (!j.committed || j.status !== "ready" || !j.file || !j.dayId || j.nextAttemptAt > now) continue;
        void this.startUpload(j);
        active++;
      }
    }
    this.armTimer(now);
  }

  private armTimer(now: number): void {
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
    let at = Infinity;
    for (const j of this.jobs.values()) {
      if (j.committed && j.status === "ready" && j.nextAttemptAt > now) at = Math.min(at, j.nextAttemptAt);
    }
    if (this.rateUntil > now) at = Math.min(at, this.rateUntil);
    if (at === Infinity) return;
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.changed();
      this.pump();
    }, Math.max(0, at - now) + 5);
  }

  private async startUpload(job: Job): Promise<void> {
    const file = job.file;
    if (!file) return;
    const controller = new AbortController();
    job.status = "uploading";
    job.startedAt = Date.now();
    job.controller = controller;
    this.touch(job);
    this.changed();

    // Пуш друзьям — один на пачку: уходит с кадром, после которого в пачке больше нечего
    // отправлять. Идущие в полёте не считаем, иначе при параллельных отправках
    // пуш не получил бы ни один кадр
    let moreToSend = false;
    for (const o of this.jobs.values()) {
      if (o !== job && o.batchId === job.batchId && o.committed && (o.status === "preparing" || o.status === "ready")) {
        moreToSend = true;
        break;
      }
    }
    const silent = moreToSend;
    const count = !moreToSend && job.batchSize > 1 ? job.batchSize : null;

    let outcome: UploadOutcome;
    try {
      outcome = await this.deps.upload({ job: this.metaOf(job), file, silent, count, signal: controller.signal });
    } catch (e) {
      outcome = { kind: "retry", message: errorMessage(e, "Ошибка сети") };
    }
    job.controller = null;
    if (job.removed) return;
    this.settle(job, outcome);
    this.changed();
    this.pump();
    this.checkDrain();
  }

  private settle(job: Job, outcome: UploadOutcome): void {
    switch (outcome.kind) {
      case "ok":
        this.finish(job);
        this.deps.onUploaded?.(this.metaOf(job), outcome.photo);
        return;
      case "duplicate":
        this.finish(job);
        return;
      case "aborted":
        job.status = "ready";
        job.nextAttemptAt = 0;
        break;
      case "retry":
        if (!this.online()) {
          // Нет сети — не наша вина и не повод тратить попытку: ждём события online
          job.status = "ready";
          job.nextAttemptAt = 0;
          break;
        }
        job.attempts++;
        if (job.attempts >= this.cfg.maxAttempts) {
          this.fail(job, outcome.message, false);
          return;
        }
        job.status = "ready";
        job.error = outcome.message;
        job.nextAttemptAt = Date.now() + backoffMs(job.attempts, this.deps.random);
        break;
      case "rate":
        job.status = "ready";
        job.nextAttemptAt = 0;
        this.rateUntil = Math.max(this.rateUntil, Date.now() + outcome.retryAfterMs);
        break;
      case "auth":
        job.status = "ready";
        job.nextAttemptAt = 0;
        this.authPaused = true;
        break;
      case "permanent":
        this.fail(job, outcome.message, true);
        return;
    }
    this.touch(job);
  }

  private finish(job: Job): void {
    this.session.done++;
    this.forget(job);
  }

  private fail(job: Job, message: string, permanent: boolean): void {
    job.status = "failed";
    job.error = message;
    job.permanent = permanent;
    job.nextAttemptAt = 0;
    this.touch(job);
    this.persistMeta(job);
  }

  // ── вспомогательное ───────────────────────────────────────────────────────

  private makeJob(meta: JobMeta, blobs?: JobBlobs): Job {
    return {
      ...meta,
      file: blobs?.file ?? null,
      thumb: blobs?.thumb ?? null,
      origin: null,
      prepStarted: false,
      attempts: 0,
      nextAttemptAt: 0,
      startedAt: 0,
      rev: 0,
      counted: false,
      removed: false,
      controller: null,
    };
  }

  private metaOf(j: Job): JobMeta {
    return {
      id: j.id,
      batchId: j.batchId,
      userId: j.userId,
      tripId: j.tripId,
      dayId: j.dayId,
      name: j.name,
      committed: j.committed,
      batchSize: j.batchSize,
      coords: j.coords,
      takenAt: j.takenAt,
      hash: j.hash,
      caption: j.caption,
      address: j.address,
      status: j.status,
      createdAt: j.createdAt,
      error: j.error,
      permanent: j.permanent,
    };
  }

  private isPending(j: Job): boolean {
    return j.committed && (j.status === "preparing" || j.status === "ready" || j.status === "uploading");
  }

  private isBatchCommitted(batchId: string): boolean {
    for (const j of this.jobs.values()) if (j.batchId === batchId && j.committed) return true;
    return false;
  }

  private assignDay(job: Job): void {
    if (job.dayId) return;
    let dayId: string | null = null;
    try {
      dayId = this.resolvers.get(job.batchId)?.(job.takenAt != null ? new Date(job.takenAt) : null) ?? null;
    } catch {
      dayId = null;
    }
    if (dayId) job.dayId = dayId;
    else this.fail(job, "Не удалось определить день маршрута", true);
  }

  private enterPending(job: Job): void {
    if (job.counted) return;
    job.counted = true;
    this.session.total++;
  }

  private revive(j: Job): void {
    if (!j.committed || j.status !== "failed" || !j.file) return;
    j.status = "ready";
    j.error = null;
    j.permanent = false;
    j.attempts = 0;
    j.nextAttemptAt = 0;
    this.enterPending(j);
    this.touch(j);
    this.persistMeta(j);
  }

  /** Сброс отступов: событие «сеть вернулась / вернулись из фона» стоит больше таймера. */
  private kick(): void {
    for (const j of this.jobs.values()) {
      if (j.status === "ready") j.nextAttemptAt = 0;
      else if (!j.permanent) this.revive(j);
    }
    this.rateUntil = 0;
  }

  /** Убрать из очереди по воле пользователя: в полёте — прервать, прогресс — пересчитать. */
  private cancel(job: Job): void {
    if (job.counted) {
      this.session.total = Math.max(0, this.session.total - 1);
      job.counted = false;
    }
    this.forget(job);
  }

  private forget(job: Job, dropFromStore = true): void {
    job.removed = true;
    job.controller?.abort();
    job.controller = null;
    job.file = null;
    job.origin = null;
    this.jobs.delete(job.id);
    this.viewCache.delete(job.id);
    this.deps.onJobGone?.(job.id);
    if (dropFromStore) this.persist(() => this.deps.store.remove(job.id));
  }

  private checkDrain(): void {
    if (this.session.total === 0 && this.session.done === 0) return;
    if (this.hasPending()) return;
    let failed = 0;
    for (const j of this.jobs.values()) {
      if (j.committed && j.status === "failed") failed++;
      j.counted = false;
    }
    const summary = { done: this.session.done, failed, total: this.session.total };
    this.session = { total: 0, done: 0 };
    this.changed(true);
    if (summary.done > 0 || summary.failed > 0) this.deps.onDrain?.(summary);
  }

  private counts(): { committed: number; staged: number } {
    let committed = 0;
    let staged = 0;
    for (const j of this.jobs.values()) {
      if (j.committed) committed++;
      else staged++;
    }
    return { committed, staged };
  }

  private touch(job: Job): void {
    job.rev++;
    this.viewCache.delete(job.id);
  }

  // ── хранилище ─────────────────────────────────────────────────────────────

  private persist(op: () => Promise<void>): void {
    // Одна цепочка: запись и последующее удаление одного кадра не должны обгонять друг друга
    this.storeChain = this.storeChain.then(op).catch(() => this.markPersistFailed());
  }

  private persistFull(job: Job): void {
    if (!job.file) return;
    const meta = this.metaOf(job);
    const blobs: JobBlobs = { file: job.file, thumb: job.thumb };
    this.persist(() => this.deps.store.save(meta, blobs));
  }

  private persistMeta(job: Job): void {
    const meta = this.metaOf(job);
    this.persist(() => this.deps.store.save(meta));
  }

  private markPersistFailed(): void {
    if (!this.persistent) return;
    this.persistent = false;
    this.deps.onPersistError?.();
    this.changed(true);
  }

  // ── уведомления и снимок ──────────────────────────────────────────────────

  private changed(immediate = false): void {
    this.version++;
    if (immediate) {
      this.flushNotify();
      return;
    }
    if (this.notifyTimer) return;
    const wait = NOTIFY_INTERVAL_MS - (Date.now() - this.lastNotify);
    if (wait <= 0) {
      this.flushNotify();
      return;
    }
    // Сотни мелких переходов статусов схлопываются в ~10 перерисовок в секунду
    this.notifyTimer = setTimeout(() => this.flushNotify(), wait);
  }

  private flushNotify(): void {
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    this.lastNotify = Date.now();
    for (const l of [...this.listeners]) l();
  }

  private toView(j: Job): JobView {
    const cached = this.viewCache.get(j.id);
    if (cached && cached.rev === j.rev) return cached;
    const view: JobView = {
      id: j.id,
      batchId: j.batchId,
      tripId: j.tripId,
      dayId: j.dayId,
      name: j.name,
      status: j.status,
      committed: j.committed,
      hasThumb: !!j.thumb,
      hasCoords: !!j.coords,
      takenAt: j.takenAt,
      error: j.error,
      permanent: j.permanent,
      canRetry: !!j.file,
      rev: j.rev,
    };
    this.viewCache.set(j.id, view);
    return view;
  }

  private buildSnapshot(): QueueSnapshot {
    const now = Date.now();
    const jobs: JobView[] = [];
    let staged = 0;
    let waiting = 0;
    let uploading = 0;
    let failed = 0;
    for (const j of this.jobs.values()) {
      jobs.push(this.toView(j));
      if (!j.committed) staged++;
      else if (j.status === "uploading") uploading++;
      else if (j.status === "failed") failed++;
      else waiting++;
    }
    const next: QueueStats = {
      staged,
      waiting,
      uploading,
      failed,
      sessionTotal: this.session.total,
      sessionDone: this.session.done,
    };
    const prev = this.lastStats;
    const same =
      prev.staged === next.staged &&
      prev.waiting === next.waiting &&
      prev.uploading === next.uploading &&
      prev.failed === next.failed &&
      prev.sessionTotal === next.sessionTotal &&
      prev.sessionDone === next.sessionDone;
    const stats = same ? prev : next;
    this.lastStats = stats;

    let pause: QueueSnapshot["pause"] = null;
    if (this.authPaused) pause = { reason: "auth" };
    else if (this.userPaused) pause = { reason: "user" };
    else if (!this.online()) pause = { reason: "offline" };
    else if (now < this.rateUntil) pause = { reason: "rate", until: this.rateUntil };

    return { jobs, stats, pause, active: this.hasPending(), persistent: this.persistent };
  }
}
