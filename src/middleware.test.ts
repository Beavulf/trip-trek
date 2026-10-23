import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware, config } from "./middleware";

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });

describe("middleware: гость", () => {
  it("корень уводит на /login без callbackUrl: лендинг — отдельная страница /landing, корень не подменяет", () => {
    const res = middleware(req("/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(new URL(res.headers.get("location")!).searchParams.has("callbackUrl")).toBe(false);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("/split/* уводит на /login и запоминает адрес (с query) для возврата после входа", () => {
    const res = middleware(req("/split/abc123?tab=balance"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("callbackUrl")).toBe("/split/abc123?tab=balance");
  });

  it("страница приглашения /split/join открыта гостю: превью группы он видит до регистрации", () => {
    const res = middleware(req("/split/join?code=ABCD2345"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });
});

describe("middleware: вошедший", () => {
  it.each(["/", "/split", "/split/abc", "/split/join"])("%s проходит", (path) => {
    const res = middleware(req(path, "next-auth.session-token=x"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});

describe("middleware: «Сочтёмся» открывается в последней группе", () => {
  const id = "cmvkx4ll80000g2kncf4h63hq";
  const session = "next-auth.session-token=x";

  it("/split с запомненной группой ведёт прямо в неё", () => {
    const res = middleware(req("/split", `${session}; triptrek-split-last=${id}`));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(`/split/${id}`);
  });

  it("/split?all=1 — это хаб: «Все группы» не должны возвращать в последнюю", () => {
    const res = middleware(req("/split?all=1", `${session}; triptrek-split-last=${id}`));
    expect(res.headers.get("location")).toBeNull();
  });

  it("без запомненной группы или с мусором в cookie — обычный хаб, без открытого редиректа", () => {
    expect(middleware(req("/split", session)).headers.get("location")).toBeNull();
    expect(middleware(req("/split", `${session}; triptrek-split-last=../admin`)).headers.get("location")).toBeNull();
  });

  it("страницы группы и быстрой траты не перенаправляются", () => {
    for (const p of [`/split/${id}`, "/split/add"]) {
      expect(middleware(req(p, `${session}; triptrek-split-last=${id}`)).headers.get("location")).toBeNull();
    }
  });

  it("гость с cookie группы всё равно идёт на вход, а не в группу", () => {
    const res = middleware(req("/split", `triptrek-split-last=${id}`));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
});

describe("middleware: скоуп", () => {
  it("matcher покрывает корень и «Сочтёмся»; /landing в него не входит, поэтому открыта гостю", () => {
    expect(config.matcher).toEqual(["/", "/split", "/split/:path*"]);
  });
});
