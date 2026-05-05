import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Pull last 30 days of: top items, sales sources, payment methods,
 * weekday performance. Returns raw aggregates for analysis.
 */
export async function GET() {
  const STATIC_KEY = process.env.FABI_STATIC_ACCESS_TOKEN || "5c885b2ef8c34fb7b1d1fad11eef7bec";

  const { data: cache } = await supabase
    .from("fabi_auth_cache")
    .select("token, brand_uid, company_uid, store_uids")
    .eq("id", "singleton")
    .single();

  if (!cache) {
    return NextResponse.json({ error: "no auth cache" }, { status: 500 });
  }

  // 30-day range in unix-ms (VN timezone)
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const endMs = new Date(`${today}T23:59:59+07:00`).getTime();
  const startMs = endMs - 29 * 86400 * 1000 - (86400 * 1000 - 1);

  const baseParams = {
    brand_uid: cache.brand_uid,
    company_uid: cache.company_uid,
    list_store_uid: (cache.store_uids || []).join(","),
    start_date: startMs,
    end_date: endMs,
    store_open_at: 0,
  };

  const headers = {
    Authorization: cache.token,
    access_token: STATIC_KEY,
    fabi_type: "pos-cms",
  };

  const endpoints = [
    { key: "items", path: "/api/v1/reports/sale-summary/items", extra: { limit: 30 } },
    { key: "sources", path: "/api/v1/reports/sale-summary/sources" },
    { key: "payment_methods", path: "/api/v1/reports/sale-summary/payment-methods" },
    { key: "weekdays", path: "/api/v1/reports/sale-summary/weekdays" },
    { key: "promotions", path: "/api/v1/reports/sale-summary/promotions" },
    { key: "overview", path: "/api/v1/reports/sale-summary/overview" },
  ];

  const out: Record<string, unknown> = {
    range: { startMs, endMs, today },
  };

  for (const ep of endpoints) {
    const url = new URL(`https://posapi.ipos.vn${ep.path}`);
    for (const [k, v] of Object.entries({ ...baseParams, ...(ep.extra || {}) })) {
      url.searchParams.set(k, String(v));
    }
    const r = await fetch(url.toString(), { headers });
    const text = await r.text();
    try {
      out[ep.key] = JSON.parse(text);
    } catch {
      out[ep.key] = { raw: text.slice(0, 300), status: r.status };
    }
  }

  return NextResponse.json(out);
}
