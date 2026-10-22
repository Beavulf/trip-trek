import { classifyUploadResponse } from "./classify";
import type { UploadOutcome, UploadRequest } from "./types";

/**
 * Один POST /api/photos. Ответ разбирает classifyUploadResponse; здесь только транспорт:
 *  - таймаут — без него зависшее соединение (мобильная сеть, GFW) держало слот очереди вечно,
 *    а «ретрай один раз» никогда не наступал;
 *  - отмена движком (возврат из фона / удаление кадра) отличается от таймаута и сбоя сети:
 *    первая не списывает попытку.
 */
export async function uploadPhoto(req: UploadRequest): Promise<UploadOutcome> {
  const { job, file, signal } = req;
  if (signal.aborted) return { kind: "aborted" };
  if (!job.dayId) return { kind: "permanent", message: "Не выбран день" };

  const fd = new FormData();
  fd.append("file", file, `photo-${job.id}.jpg`);
  fd.append("tripId", job.tripId);
  fd.append("dayId", job.dayId);
  if (job.caption) fd.append("caption", job.caption);
  if (job.coords) {
    fd.append("lat", String(job.coords.lat));
    fd.append("lng", String(job.coords.lng));
  }
  if (job.address) fd.append("address", job.address);
  if (job.takenAt) fd.append("takenAt", new Date(job.takenAt).toISOString());
  if (job.hash) fd.append("contentHash", job.hash);
  if (req.silent) fd.append("suppressPush", "1");
  else if (req.count) fd.append("count", String(req.count));

  // ~20 КБ/с как нижняя планка скорости: 400 КБ кадр — 30 с минимум, 2,5 МБ — около двух минут
  const timeoutMs = Math.min(180_000, Math.max(30_000, file.size / 20));
  const ctrl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctrl.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);

  try {
    const res = await fetch("/api/photos", { method: "POST", body: fd, signal: ctrl.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // тело оборвалось или не JSON: статус всё равно решает (2xx — сервер кадр принял)
    }
    return classifyUploadResponse(res.status, body, res.headers.get("Retry-After"));
  } catch {
    if (signal.aborted) return { kind: "aborted" };
    if (timedOut) return { kind: "retry", message: "Сервер не ответил вовремя" };
    return { kind: "retry", message: "Нет связи с сервером" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
