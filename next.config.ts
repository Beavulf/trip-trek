import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // Не палим стек (X-Powered-By: Next.js)
  poweredByHeader: false,
  // recharts (+d3) дублировался в чанках `/` и `/admin` — по копии ~390KB raw
  // (аудит перфоманса 2026-09-13). Общая cache-group: оба маршрута делят один чанк.
  // Работает при webpack-сборке (Dockerfile собирает через `next build --webpack`).
  // Без мутаций входного конфига: bun server.ts (dev) получает его замороженным —
  // присваивание падает с «Attempted to assign to readonly property».
  webpack(config) {
    const base =
      config.optimization?.splitChunks && typeof config.optimization.splitChunks === "object"
        ? (config.optimization.splitChunks as Record<string, unknown>)
        : {};
    const splitChunks = {
      ...base,
      cacheGroups: {
        ...((base.cacheGroups as Record<string, unknown>) ?? {}),
        recharts: {
          name: "recharts",
          test: /[\\/]node_modules[\\/](recharts|d3-[a-z-]+|victory-vendor|internmap|decimal.js-light|eventemitter3)[\\/]/,
          priority: 20,
          reuseExistingChunk: true,
          enforce: true,
        },
      },
    };
    return {
      ...config,
      optimization: { ...config.optimization, splitChunks },
    };
  },
  // P1 hardening: базовые защитные заголовки для всех ответов
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
          // HSTS здесь, а не в Caddyfile: заголовок переживает смену хостинга/прокси.
          // Браузер игнорирует его на http://localhost, dev не ломается.
          // includeSubDomains добавлен (аудит 2026-09-12); preload — не раньше,
          // чем будет уверенность в HTTPS на всех поддоменах.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
