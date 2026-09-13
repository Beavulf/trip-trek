import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Тесты идут в node-env: пока покрываем только чистые функции src/lib.
// jsdom не нужен — компоненты с Leaflet через интерфейсы не рендерим.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
