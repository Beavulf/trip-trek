/**
 * Минимальный логгер: в dev — читаемые строки, в prod — JSON-строки
 * (одна строка = одно событие, удобно грепать в docker logs).
 */
function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function emit(level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) {
  const line = isProd()
    ? JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra })
    : `[${level.toUpperCase()}] ${msg}${extra ? " " + JSON.stringify(extra) : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, extra?: Record<string, unknown>) => emit("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit("error", msg, extra),
};
