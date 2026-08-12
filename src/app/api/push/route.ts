import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

// In-memory stub — prod: use /api/push/subscribe + VAPID + DB
const subscriptions: PushSubscription[] = [];

export async function POST(req: NextRequest) {
  const { response } = await requireUser(req);
  if (response) return response;

  try {
    const sub = await req.json();
    if (sub?.endpoint) {
      subscriptions.push(sub);
      console.log(`[Push] New subscription: ${sub.endpoint.slice(0, 50)}...`);
    }
    return NextResponse.json({ success: true, count: subscriptions.length, stub: true });
  } catch {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const { response } = await requireUser(req);
  if (response) return response;

  try {
    const { message, title } = await req.json();
    console.log(`[Push] Would send: ${title} — ${message}`);
    return NextResponse.json({ success: true, sent: subscriptions.length, stub: true });
  } catch {
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { response } = await requireUser(req);
  if (response) return response;
  return NextResponse.json({ count: subscriptions.length, stub: true });
}
