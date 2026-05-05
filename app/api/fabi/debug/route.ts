import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Debug-only: login inline + probe date formats. Bypasses the DB cache
 * so RLS or schema issues don't get in the way.
 */
export async function GET() {
  const STATIC_KEY = process.env.FABI_STATIC_ACCESS_TOKEN || "5c885b2ef8c34fb7b1d1fad11eef7bec";
  const email = process.env.FABI_EMAIL;
  const password = process.env.FABI_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ error: "FABI_EMAIL/PASSWORD missing" }, { status: 500 });
  }

  // 1) Login
  const loginRes = await fetch("https://posapi.ipos.vn/api/accounts/v1/user/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: STATIC_KEY,
      fabi_type: "pos-cms",
    },
    body: JSON.stringify({ email, password }),
  });
  const loginJson = (await loginRes.json()) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = (loginJson as any).data?.data || (loginJson as any).data || {};
  const token: string | undefined = data.token;
  const brand_uid: string | undefined = data.brands?.[0]?.id;
  const company_uid: string | undefined = data.company?.id;
  const store_uids: string[] = (data.stores || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => s.id || s.uid)
    .filter(Boolean);

  if (!token || !brand_uid || !company_uid) {
    return NextResponse.json(
      { error: "login parse failed", loginStatus: loginRes.status, keys: Object.keys(data) },
      { status: 500 }
    );
  }

  // 2) Probe formats
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const startUnix = new Date(`${todayIso}T00:00:00+07:00`).getTime() / 1000;
  const endUnix = startUnix + 86400 - 1;

  const variants: Array<{ name: string; params: Record<string, string | number> }> = [
    {
      name: "ISO_open0",
      params: { start_date: todayIso, end_date: todayIso, store_open_at: 0 },
    },
    {
      name: "ISO_open7",
      params: { start_date: todayIso, end_date: todayIso, store_open_at: 7 },
    },
    {
      name: "ISO_datetime",
      params: { start_date: `${todayIso} 00:00:00`, end_date: `${todayIso} 23:59:59`, store_open_at: 0 },
    },
    {
      name: "unix_seconds",
      params: { start_date: startUnix, end_date: endUnix, store_open_at: 0 },
    },
    {
      name: "unix_ms",
      params: { start_date: startUnix * 1000, end_date: endUnix * 1000, store_open_at: 0 },
    },
    {
      name: "no_open_at",
      params: { start_date: todayIso, end_date: todayIso },
    },
    {
      name: "open_25200",
      params: { start_date: todayIso, end_date: todayIso, store_open_at: 25200 },
    },
  ];

  const results: Array<{ name: string; status: number; body: string }> = [];

  for (const v of variants) {
    const url = new URL("https://posapi.ipos.vn/api/v1/reports/sale-summary/overview");
    url.searchParams.set("brand_uid", brand_uid);
    url.searchParams.set("company_uid", company_uid);
    url.searchParams.set("list_store_uid", store_uids.join(","));
    for (const [k, val] of Object.entries(v.params)) url.searchParams.set(k, String(val));
    const r = await fetch(url.toString(), {
      headers: { Authorization: token, access_token: STATIC_KEY, fabi_type: "pos-cms" },
    });
    const text = await r.text();
    results.push({ name: v.name, status: r.status, body: text.slice(0, 250) });
  }

  return NextResponse.json({
    today: todayIso,
    brand_uid,
    company_uid,
    store_uids,
    results,
  });
}
