import { NextResponse } from "next/server";
import { portfolioPayload } from "@/lib/portfolio";

// Auth is enforced by proxy.ts (owner session or OWNER_API_TOKEN bearer).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(portfolioPayload(), {
    headers: { "Cache-Control": "no-store" },
  });
}
