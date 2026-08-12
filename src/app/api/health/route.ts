import { NextResponse } from "next/server";

// GET /api/health — healthcheck для Docker
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
}
