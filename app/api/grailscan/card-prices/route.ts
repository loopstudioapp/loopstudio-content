import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const url = process.env.GRAILSCAN_SUPABASE_URL;
  const secretKey = process.env.GRAILSCAN_SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    return NextResponse.json({ error: "Dashboard data source is not configured" }, { status: 503 });
  }

  const cardID = request.nextUrl.searchParams.get("card_id");
  if (!cardID || !UUID_PATTERN.test(cardID)) {
    return NextResponse.json({ error: "Invalid card ID" }, { status: 400 });
  }

  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("get_grailscan_card_prices", {
    p_card_id: cardID,
    p_limit: 250,
  });

  if (error) {
    console.error("GrailScan price history query failed", error.code);
    return NextResponse.json({ error: "Could not load price history" }, { status: 502 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
