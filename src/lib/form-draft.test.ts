import { describe, it, expect } from "vitest";

import { DRAFT_TTL_MS, clearDraft, draftKey, hasDraft, readDraft, writeDraft, type DraftStorage } from "./form-draft";

function memoryStorage(): DraftStorage & { dump(): Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

describe("form-draft", () => {
  it("пишет и читает черновик, ключ привязан к поездке и юзеру", () => {
    const st = memoryStorage();
    const k = draftKey("expense", "t1", "u1");
    writeDraft(k, { amount: "120", category: "food" }, st, 1_000);
    expect(readDraft(k, st, 2_000)).toEqual({ amount: "120", category: "food" });
    expect(readDraft(draftKey("expense", "t2", "u1"), st, 2_000)).toBeNull();
    expect(readDraft(draftKey("expense", "t1", "u2"), st, 2_000)).toBeNull();
    expect(readDraft(draftKey("journal", "t1", "u1"), st, 2_000)).toBeNull();
  });

  it("протухший черновик (старше TTL) не возвращается и стирается", () => {
    const st = memoryStorage();
    const k = draftKey("journal", "t1", "u1");
    writeDraft(k, { content: "привет" }, st, 0);
    expect(readDraft(k, st, DRAFT_TTL_MS + 1)).toBeNull();
    expect(st.dump()).toEqual({});
  });

  it("битый JSON и чужой формат не роняют форму", () => {
    const st = memoryStorage();
    st.setItem("k", "{не json");
    expect(readDraft("k", st)).toBeNull();
    st.setItem("k2", JSON.stringify({ data: { a: 1 } })); // без savedAt
    expect(readDraft("k2", st)).toBeNull();
  });

  it("clearDraft и hasDraft", () => {
    const st = memoryStorage();
    writeDraft("k", { a: 1 }, st);
    expect(hasDraft("k", st)).toBe(true);
    clearDraft("k", st);
    expect(hasDraft("k", st)).toBe(false);
  });

  it("недоступное хранилище (null / бросает) — тихо ничего не делает", () => {
    const broken: DraftStorage = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("denied"); },
    };
    expect(() => writeDraft("k", { a: 1 }, broken)).not.toThrow();
    expect(readDraft("k", broken)).toBeNull();
    expect(() => clearDraft("k", broken)).not.toThrow();
    expect(readDraft("k", null)).toBeNull();
    expect(() => writeDraft("k", { a: 1 }, null)).not.toThrow();
  });
});
