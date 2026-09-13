import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // Не палим стек (X-Powered-By: Next.js)
  poweredByHeader: false,
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
