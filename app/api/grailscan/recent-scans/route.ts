import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = process.env.GRAILSCAN_SUPABASE_URL;
  const secretKey = process.env.GRAILSCAN_SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    return NextResponse.json({ error: "Dashboard data source is not configured" }, { status: 503 });
  }

  const updatedAfter = request.nextUrl.searchParams.get("updated_after");
  if (updatedAfter && Number.isNaN(Date.parse(updatedAfter))) {
    return NextResponse.json({ error: "Invalid update cursor" }, { status: 400 });
  }

  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("get_grailscan_recent_scans", {
    p_updated_after: updatedAfter || null,
    p_limit: 100,
  });

  if (error) {
    console.error("GrailScan recent scans query failed", error.code);
    return NextResponse.json({ error: "Could not refresh recent scans" }, { status: 502 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
