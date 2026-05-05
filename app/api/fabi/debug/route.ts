import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Debug-only: probes login + various date formats on overview endpoint.
 * Remove once integration works.
 */
export async function GET() {
  const STATIC_KEY = process.env.FABI_STATIC_ACCESS_TOKEN || "5c885b2ef8c34fb7b1d1fad11eef7bec";

  // Pull cached token + IDs (we already validated login works)
  const { data: cache } = await supabase
    .from("fabi_auth_cache")
    .select("token, brand_uid, company_uid, store_uids")
    .eq("id", "singleton")
    .single();

  if (!cache) {
    return NextResponse.json({ error: "no auth cache — run /api/fabi/sync first" }, { status: 500 });
  }

  // Today in VN timezone for the request
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const startOfDayUtc = new Date(`${todayIso}T00:00:00+07:00`).getTime() / 1000;
  const endOfDayUtc = startOfDayUtc + 86400 - 1;

  const variants = [
    { name: "ISO_date", start_date: todayIso, end_date: todayIso, store_open_at: "07:00" },
    { name: "ISO_date_open0", start_date: todayIso, end_date: todayIso, store_open_at: 0 },
    { name: "ISO_datetime", start_date: `${todayIso} 00:00:00`, end_date: `${todayIso} 23:59:59`, store_open_at: 0 },
    { name: "unix_seconds", start_date: startOfDayUtc, end_date: endOfDayUtc, store_open_at: 0 },
    { name: "unix_ms", start_date: startOfDayUtc * 1000, end_date: endOfDayUtc * 1000, store_open_at: 0 },
    { name: "DDMMYYYY", start_date: todayIso.split("-").reverse().join("/"), end_date: todayIso.split("-").reverse().join("/"), store_open_at: 0 },
  ];

  const headers = {
    Authorization: cache.token,
    access_token: STATIC_KEY,
    fabi_type: "pos-cms",
  };

  const results: Array<{ name: string; status: number; body: string }> = [];

  for (const v of variants) {
    const url = new URL("https://posapi.ipos.vn/api/v1/reports/sale-summary/overview");
    url.searchParams.set("brand_uid", cache.brand_uid);
    url.searchParams.set("company_uid", cache.company_uid);
    url.searchParams.set("list_store_uid", (cache.store_uids || []).join(","));
    url.searchParams.set("start_date", String(v.start_date));
    url.searchParams.set("end_date", String(v.end_date));
    url.searchParams.set("store_open_at", String(v.store_open_at));

    const r = await fetch(url.toString(), { headers });
    const text = await r.text();
    results.push({ name: v.name, status: r.status, body: text.slice(0, 300) });
  }

  return NextResponse.json({
    todayIso,
    startOfDayUtc,
    brand_uid: cache.brand_uid,
    company_uid: cache.company_uid,
    store_uids: cache.store_uids,
    results,
  });
}
