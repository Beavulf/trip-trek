import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware, config } from "./middleware";

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });

describe("middleware: гость", () => {
  it("корень показывает лендинг: rewrite на /landing, URL и статус не меняются", () => {
    const res = middleware(req("/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull(); // rewrite, а не redirect — ссылка из био остаётся чистой
    expect(res.headers.get("x-middleware-rewrite")).toContain("/landing");
  });
});

describe("middleware: вошедший", () => {
  it.each(["next-auth.session-token=x", "__Secure-next-auth.session-token=x"])(
    "корень с cookie %s отдаёт приложение без rewrite",
    (cookie) => {
      const res = middleware(req("/", cookie));
      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    },
  );
});

describe("middleware: скоуп", () => {
  // Обработка /split* ушла из middleware: гостя на страницах «Сочтёмся» возвращает
  // на вход сам SplitShell на клиенте, а открытый /split/join работает без middleware
  it("matcher ограничен корнем — остальные пути middleware не трогает", () => {
    expect(config.matcher).toEqual(["/"]);
  });
});
