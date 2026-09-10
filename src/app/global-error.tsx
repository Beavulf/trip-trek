"use client";

// Последняя линия обороны: падение самого root-layout (в т.ч. во время SSR)
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0a", color: "#fafafa" }}>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 44 }}>🧭</div>
            <h2 style={{ fontSize: 18, margin: "12px 0 8px" }}>Приложение упало</h2>
            <p style={{ fontSize: 14, opacity: 0.7, lineHeight: 1.5, margin: "0 0 16px" }}>
              Что-то сломалось на самом верхнем уровне. Данные в безопасности — попробуйте перезагрузить.
            </p>
            {error.digest && <p style={{ fontSize: 10, opacity: 0.4 }}>код: {error.digest}</p>}
            <button
              onClick={reset}
              style={{
                minHeight: 44,
                padding: "0 20px",
                borderRadius: 12,
                border: "none",
                background: "#f97316",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Перезагрузить
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
