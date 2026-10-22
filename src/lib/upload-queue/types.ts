// Контракты фоновой очереди загрузки фото (см. engine.ts). Всё здесь — чистые типы:
// движок не знает ни про DOM, ни про fetch, ни про IndexedDB, поэтому гоняется
// юнит-тестами в node-env с подставными зависимостями.

/** Статусы живого задания. «Готово» статуса нет: принятое сервером задание удаляется. */
export type JobStatus = "preparing" | "ready" | "uploading" | "failed" | "duplicate";

export interface Coords {
  lat: number;
  lng: number;
}

/** Метаданные задания — то, что лежит в IndexedDB рядом с блобами. */
export interface JobMeta {
  id: string;
  batchId: string;
  /** Чьё задание: на общем устройстве очередь одного юзера не должна улетать от имени другого */
  userId: string;
  tripId: string;
  dayId: string | null;
  name: string;
  /** Юзер нажал «Загрузить». Некоммиченные кадры — черновик выбора: сами не уходят */
  committed: boolean;
  /** Сколько кадров в пачке на момент отправки — для пуша «добавил N фото» */
  batchSize: number;
  coords: Coords | null;
  /** Дата съёмки из EXIF, ms epoch */
  takenAt: number | null;
  /** sha256 оригинала — дедуп на сервере и в очереди */
  hash: string | null;
  caption: string | null;
  address: string | null;
  status: JobStatus;
  createdAt: number;
  error: string | null;
  /** Сервер отклонил насовсем (формат, права): повтор бессмыслен */
  permanent: boolean;
}

export interface JobBlobs {
  /** Сжатая копия для отправки */
  file: Blob;
  /** Маленькое превью для сетки */
  thumb: Blob | null;
}

export interface StoredJob {
  meta: JobMeta;
  blobs: JobBlobs;
}

/** Результат подготовки кадра: сжатие + превью + EXIF + отпечаток. */
export interface Prepared {
  file: Blob;
  thumb: Blob | null;
  coords: Coords | null;
  takenAt: number | null;
  hash: string | null;
}

/**
 * Хранилище очереди. save/remove могут отклонять промис (квота, закрытая БД):
 * движок помечает очередь «не персистентной» и продолжает работать в памяти.
 * load обязан возвращать только задания с блобами.
 */
export interface JobStore {
  load(): Promise<StoredJob[]>;
  /** blobs передаются только при первой записи — метаданные потом обновляются дёшево */
  save(meta: JobMeta, blobs?: JobBlobs): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface UploadRequest {
  job: JobMeta;
  file: Blob;
  /** Не слать друзьям пуш (кадр не последний в пачке) */
  silent: boolean;
  /** Размер пачки для текста пуша; null — одиночный кадр */
  count: number | null;
  signal: AbortSignal;
}

export type UploadOutcome =
  | { kind: "ok"; photo: unknown }
  /** Сервер уже имеет этот кадр (409): для пользователя это успех */
  | { kind: "duplicate" }
  /** Сеть, таймаут, 5xx — попробуем ещё */
  | { kind: "retry"; message: string }
  /** 429: пауза всей очереди на retryAfterMs, попытка не списывается */
  | { kind: "rate"; message: string; retryAfterMs: number }
  /** 401: пауза до возврата сессии */
  | { kind: "auth"; message: string }
  /** Отклонено насовсем */
  | { kind: "permanent"; message: string }
  /** Прервано самим движком (возврат из фона): попытка не списывается */
  | { kind: "aborted" };

export type DayResolver = (takenAt: Date | null) => string | null;

export interface DrainSummary {
  done: number;
  failed: number;
  total: number;
}

/** Облегчённое представление задания для UI (без блобов). */
export interface JobView {
  id: string;
  batchId: string;
  tripId: string;
  dayId: string | null;
  name: string;
  status: JobStatus;
  committed: boolean;
  hasThumb: boolean;
  hasCoords: boolean;
  takenAt: number | null;
  error: string | null;
  permanent: boolean;
  /** Есть что отправлять повторно (у упавших на подготовке блоба нет) */
  canRetry: boolean;
  /** Номер ревизии — меняется при любой правке задания, для memo плиток */
  rev: number;
}

export type PauseReason = "offline" | "auth" | "rate" | "user";

export interface QueueStats {
  /** Черновик выбора: кадры, которые юзер ещё не отправил */
  staged: number;
  /** Отправленные юзером, ждут подготовки/очереди */
  waiting: number;
  uploading: number;
  failed: number;
  /** Прогресс текущего «сеанса» загрузки (с момента, когда очередь была пуста) */
  sessionTotal: number;
  sessionDone: number;
}

export interface QueueSnapshot {
  jobs: readonly JobView[];
  stats: QueueStats;
  pause: { reason: PauseReason; until?: number } | null;
  /** Есть работа, которую нельзя терять: идёт/ждёт отправка */
  active: boolean;
  /** Хранилище работает: очередь переживёт закрытие приложения */
  persistent: boolean;
}

export interface EngineConfig {
  prepareConcurrency: number;
  uploadConcurrency: number;
  /** Попыток на кадр до перехода в «не загрузилось» (не считая ожидания сети) */
  maxAttempts: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  prepareConcurrency: 2,
  uploadConcurrency: 3,
  maxAttempts: 6,
};

export interface EngineDeps {
  store: JobStore;
  prepare(file: File): Promise<Prepared>;
  upload(req: UploadRequest): Promise<UploadOutcome>;
  /** Сервер принял кадр — вставить его в кэш галереи, не дожидаясь рефетча */
  onUploaded?(meta: JobMeta, photo: unknown): void;
  /** Очередь опустела (все отправленные кадры завершены или упали) */
  onDrain?(summary: DrainSummary): void;
  /** Задание ушло из очереди — освободить object URL превью */
  onJobGone?(id: string): void;
  /** Известен ли отпечаток в поездке (кэш галереи) — дубли помечаются до отправки */
  isKnownHash?(tripId: string, hash: string): boolean;
  isOnline?(): boolean;
  /** Запись в хранилище не удалась (квота, приватный режим): очередь живёт только в памяти */
  onPersistError?(): void;
  config?: Partial<EngineConfig>;
  random?: () => number;
}
