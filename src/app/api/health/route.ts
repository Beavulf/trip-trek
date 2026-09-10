import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/health — healthcheck для Docker/orchestrator:
// 200 = приложение И база отвечают; 503 = БД недоступна
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "up",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        db: "down",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
