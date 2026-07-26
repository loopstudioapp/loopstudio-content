import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  const url = process.env.GRAILSCAN_SUPABASE_URL;
  const secretKey = process.env.GRAILSCAN_SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    return NextResponse.json({ error: "Dashboard data source is not configured" }, { status: 503 });
  }

  const query = request.nextUrl.searchParams.get("query")?.trim() || null;
  const cursorUpdatedAt = request.nextUrl.searchParams.get("cursor_updated_at");
  const cursorID = request.nextUrl.searchParams.get("cursor_id");
  if (
    (cursorUpdatedAt && !cursorID) ||
    (!cursorUpdatedAt && cursorID) ||
    (cursorUpdatedAt && Number.isNaN(Date.parse(cursorUpdatedAt)))
  ) {
    return NextResponse.json({ error: "Invalid card cursor" }, { status: 400 });
  }

  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("get_grailscan_cards", {
    p_query: query,
    p_cursor_updated_at: cursorUpdatedAt,
    p_cursor_id: cursorID,
    p_limit: PAGE_SIZE,
  });

  if (error) {
    console.error("GrailScan cards query failed", error.code);
    return NextResponse.json({ error: "Could not load cards" }, { status: 502 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
