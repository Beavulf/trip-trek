import { describe, it, expect } from "vitest";

import { backoffMs, classifyUploadResponse, parseRetryAfter } from "./classify";

describe("classifyUploadResponse", () => {
  it("2xx — успех с телом ответа", () => {
    expect(classifyUploadResponse(200, { id: "p1" })).toEqual({ kind: "ok", photo: { id: "p1" } });
  });

  it("409 — дубль, то есть успех для очереди", () => {
    expect(classifyUploadResponse(409, { error: "Это фото уже загружено в поездку", duplicateOf: "x" })).toEqual({
      kind: "duplicate",
    });
  });

  it("401 — пауза до входа, сообщение сервера сохраняется", () => {
    expect(classifyUploadResponse(401, { error: "Не авторизован" })).toEqual({ kind: "auth", message: "Не авторизован" });
  });

  it("429 — пауза по Retry-After, но не короче 5 с и не длиннее 10 мин", () => {
    expect(classifyUploadResponse(429, { error: "Лимит" }, "30")).toMatchObject({ kind: "rate", retryAfterMs: 30_000 });
    expect(classifyUploadResponse(429, {}, "1")).toMatchObject({ retryAfterMs: 5_000 });
    expect(classifyUploadResponse(429, {}, "99999")).toMatchObject({ retryAfterMs: 600_000 });
    expect(classifyUploadResponse(429, {}, null)).toMatchObject({ retryAfterMs: 60_000 });
  });

  it.each([408, 425, 500, 502, 503, 504])("%i — временный сбой, повторяем", (status) => {
    expect(classifyUploadResponse(status, {}).kind).toBe("retry");
  });

  it.each([400, 403, 404, 413, 415])("%i — насовсем, повтор не поможет", (status) => {
    expect(classifyUploadResponse(status, { error: "нет" })).toEqual({ kind: "permanent", message: "нет" });
  });

  it("тело без error / не JSON — запасной текст со статусом", () => {
    expect(classifyUploadResponse(500, null)).toEqual({ kind: "retry", message: "Сервер ответил 500" });
    expect(classifyUploadResponse(418, "teapot")).toEqual({ kind: "permanent", message: "Ошибка 418" });
  });
});

describe("parseRetryAfter", () => {
  it("понимает HTTP-дату", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(parseRetryAfter("Thu, 22 Oct 2026 12:00:40 GMT", now)).toBe(40_000);
  });

  it("мусор — дефолт минуты", () => {
    expect(parseRetryAfter("скоро")).toBe(60_000);
  });
});

describe("backoffMs", () => {
  it("растёт вдвое и упирается в минуту", () => {
    const mid = () => 0.5; // джиттер 1.0
    expect([1, 2, 3, 4, 5, 6, 9].map((n) => backoffMs(n, mid))).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000]);
  });

  it("джиттер держится в ±25%", () => {
    expect(backoffMs(3, () => 0)).toBe(6000);
    expect(backoffMs(3, () => 1)).toBe(10000);
  });
});
