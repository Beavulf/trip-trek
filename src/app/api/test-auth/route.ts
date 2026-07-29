import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return NextResponse.json({ 
    loaded: true, 
    providers: authOptions.providers?.length || 0,
    hasCallbacks: !!authOptions.callbacks,
  });
}
