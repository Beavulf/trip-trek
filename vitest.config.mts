import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Тесты идут в node-env: пока покрываем только чистые функции src/lib.
// jsdom не нужен — компоненты с Leaflet через интерфейсы не рендерим.
// Часть тестов дат задаёт время в UTC, а «сегодня» в приложении считается по часам устройства.
// TZ из окружения сохраняем: так набор можно прогнать и в другом поясе (TZ=Asia/Shanghai)
process.env.TZ ??= "UTC";

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
