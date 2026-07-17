import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.GRAILSCAN_SUPABASE_URL;
  const secretKey = process.env.GRAILSCAN_SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    return NextResponse.json({ error: "Dashboard data source is not configured" }, { status: 503 });
  }

  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("get_grailscan_dashboard", {
    p_request_limit: 100,
    p_days: 30,
  });

  if (error) {
    console.error("GrailScan dashboard query failed", error.code);
    return NextResponse.json({ error: "Could not load dashboard data" }, { status: 502 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
