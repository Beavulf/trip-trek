import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/rate-limit";

// GET /api/health — healthcheck для Docker/orchestrator:
// 200 = приложение И база отвечают; 503 = БД недоступна

// Кэш статуса БД на 5 секунд: роут анонимный, и без кэша каждый флуд-запрос
// отбирал слот пула (connection_limit=10) у пользовательских запросов
// (аудит 2026-09-12). Docker-healthcheck ходит раз в 30с — кэш не мешает.
let dbState: { up: boolean; checkedAt: number } = { up: false, checkedAt: 0 };
const DB_CACHE_MS = 5_000;

async function checkDb(): Promise<boolean> {
  const now = Date.now();
  if (now - dbState.checkedAt < DB_CACHE_MS) return dbState.up;
  try {
    await db.$queryRaw`SELECT 1`;
    dbState = { up: true, checkedAt: now };
  } catch {
    dbState = { up: false, checkedAt: now };
  }
  return dbState.up;
}

export async function GET(req: NextRequest) {
  const limited = rateLimitMiddleware(req, "health", 60, 60_000);
  if (limited) return limited;

  const up = await checkDb();
  if (!up) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "down",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
  return NextResponse.json({
    status: "ok",
    db: "up",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
}
