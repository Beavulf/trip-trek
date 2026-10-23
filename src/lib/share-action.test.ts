import { describe, expect, it } from "vitest";
import { resolveShareAction } from "./share-action";

describe("resolveShareAction", () => {
  it("navigator.share — нативный шеринг", () => {
    expect(resolveShareAction({ share: async () => {} })).toBe("native");
  });

  it("без share — копирование (Firefox на ПК)", () => {
    expect(resolveShareAction({})).toBe("clipboard");
  });

  it("navigator отсутствует — копирование", () => {
    expect(resolveShareAction(undefined)).toBe("clipboard");
    expect(resolveShareAction(null)).toBe("clipboard");
  });
});
