import { NextRequest, NextResponse } from "next/server";

// GET /api/push/vapid-public-key — получить публичный VAPID ключ
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });
  }
  return NextResponse.json({ publicKey });
}
