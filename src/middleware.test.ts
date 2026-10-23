import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });

describe("middleware: гость", () => {
  it("корень уводит на /login без callbackUrl", () => {
    const res = middleware(req("/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(new URL(res.headers.get("location")!).searchParams.has("callbackUrl")).toBe(false);
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
  });
});
