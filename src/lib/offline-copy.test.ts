import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearOfflineData, fetchWithOfflineCopy, readOfflineCopy, readOfflineUser, saveOfflineCopy, saveOfflineUser } from "./offline-copy";

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  const base = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
  // Object.keys(localStorage) в браузере перечисляет ключи: повторяем это
  return new Proxy(base, {
    ownKeys: () => [...m.keys()],
    getOwnPropertyDescriptor: (_t, k) => (m.has(String(k)) ? { enumerable: true, configurable: true, value: m.get(String(k)) } : undefined),
  }) as unknown as Storage;
}

const json = (body: unknown) => new Response(JSON.stringify(body));
const parse = (r: Response) => r.json() as Promise<string[]>;

describe("копия на устройстве", () => {
  beforeEach(() => vi.stubGlobal("localStorage", fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("свежий ответ сохраняется и читается без сети", async () => {
    await expect(fetchWithOfflineCopy("info", "t1", async () => json(["110"]), parse)).resolves.toEqual(["110"]);
    const load = async () => Promise.reject(new TypeError("Failed to fetch"));
    await expect(fetchWithOfflineCopy("info", "t1", load, parse)).resolves.toEqual(["110"]);
  });

  it("у каждой поездки своя копия", () => {
    saveOfflineCopy("info", "t1", ["a"]);
    expect(readOfflineCopy("info", "t2")).toBeNull();
    expect(readOfflineCopy("checklist", "t1")).toBeNull();
  });

  it("сетевой сбой без копии остаётся ошибкой", async () => {
    await expect(fetchWithOfflineCopy("info", "t1", () => Promise.reject(new Error("сеть")), parse)).rejects.toThrow("сеть");
  });

  it("ошибка сервера не подменяется копией: у человека могли забрать доступ", async () => {
    saveOfflineCopy("info", "t1", ["старое"]);
    const denied = async (r: Response) => {
      if (!r.ok) throw new Error("403");
      return r.json() as Promise<string[]>;
    };
    await expect(fetchWithOfflineCopy("info", "t1", async () => new Response("{}", { status: 403 }), denied)).rejects.toThrow("403");
    expect(readOfflineCopy("info", "t1")).toEqual(["старое"]);
  });

  it("выход стирает всё своё и не трогает чужие ключи", () => {
    localStorage.setItem("triptrek-current-trip", "t1");
    saveOfflineCopy("info", "t1", ["a"]);
    saveOfflineUser({ id: "u1" });
    clearOfflineData();
    expect(readOfflineCopy("info", "t1")).toBeNull();
    expect(readOfflineUser()).toBeNull();
    expect(localStorage.getItem("triptrek-current-trip")).toBe("t1");
  });

  it("битая запись не роняет приложение", () => {
    localStorage.setItem("tt_offline_user", "{не json");
    expect(readOfflineUser()).toBeNull();
  });
});
