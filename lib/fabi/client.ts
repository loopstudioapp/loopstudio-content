/**
 * FABi (iPOS) internal API client.
 *
 * Uses the same private endpoints the fabi.ipos.vn web app calls.
 * Auth: cached JWT (7-day lifetime) + static access_token + fabi_type header.
 */

import { supabase } from "@/lib/supabase";

const BASE = "https://posapi.ipos.vn";
const STATIC_KEY = process.env.FABI_STATIC_ACCESS_TOKEN || "5c885b2ef8c34fb7b1d1fad11eef7bec";

// Re-login if token is within this window of expiring (24h safety buffer on a 7-day token)
const REFRESH_BEFORE_EXPIRY_MS = 24 * 60 * 60 * 1000;

type AuthCache = {
  token: string;
  token_expires_at: string; // ISO
  brand_uid: string;
  company_uid: string;
  store_uids: string[];
};

type LoginResponse = {
  data?: {
    data?: {
      token?: string;
      brands?: Array<{ id: string }>;
      stores?: Array<{ id?: string; uid?: string; brand_uid?: string }>;
      company?: { id?: string; company_id?: string };
    };
    // Some endpoints flatten by one level
    token?: string;
    brands?: Array<{ id: string }>;
    stores?: Array<{ id?: string; uid?: string; brand_uid?: string }>;
    company?: { id?: string; company_id?: string };
  };
  // Error envelope (FABi returns HTTP 200 on bad creds with an error body)
  error?: { code?: number; message?: string };
};

type OverviewResponse = {
  data?: {
    revenue_net?: number;
    revenue_gross?: number;
    discount_amount?: number;
    total_sales?: number;
    previous_period?: { percentage?: number; revenue_net?: number };
  };
};

const baseHeaders = (token?: string): Record<string, string> => {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    access_token: STATIC_KEY,
    fabi_type: "pos-cms",
  };
  if (token) h.Authorization = token;
  return h;
};

// JWT decode without verification — safe, only reading exp claim
function decodeJwtExp(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
    );
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

async function login(): Promise<AuthCache> {
  const email = process.env.FABI_EMAIL;
  const password = process.env.FABI_PASSWORD;
  if (!email || !password) {
    throw new Error("FABI_EMAIL or FABI_PASSWORD env var missing");
  }

  const res = await fetch(`${BASE}/api/accounts/v1/user/login`, {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FABi login failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as LoginResponse;

  // FABi returns 200 on auth errors with error in body
  if (json.error?.message) {
    throw new Error(`FABi login rejected: ${json.error.message}`);
  }

  // Try both nested (data.data.*) and flat (data.*) shapes
  const inner = json.data?.data || json.data || {};
  const token = inner.token;
  // brand_uid / company_uid in API queries are the internal UUID `id`,
  // NOT the public `*_id` code (e.g. "BRAND-JCPN" / "VGQLLQE1MPMY")
  const brandUid = inner.brands?.[0]?.id;
  const companyUid = inner.company?.id;
  const storeUids = (inner.stores || []).map((s) => s.id || s.uid || "").filter(Boolean);

  if (!token || !brandUid || !companyUid) {
    throw new Error(
      `FABi login: response shape mismatch. Keys: ${Object.keys(inner).join(",")}. ` +
        `Has token=${!!token}, brand=${!!brandUid}, company=${!!companyUid}`
    );
  }

  // JWT exp is unix seconds; fall back to 7 days from now
  const exp = decodeJwtExp(token);
  const expiresAt = exp
    ? new Date(exp * 1000).toISOString()
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const cache: AuthCache = {
    token,
    token_expires_at: expiresAt,
    brand_uid: brandUid,
    company_uid: companyUid,
    store_uids: storeUids,
  };

  await supabase.from("fabi_auth_cache").upsert(
    {
      id: "singleton",
      token: cache.token,
      token_expires_at: cache.token_expires_at,
      brand_uid: cache.brand_uid,
      company_uid: cache.company_uid,
      store_uids: cache.store_uids,
      refreshed_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  return cache;
}

async function getValidAuth(): Promise<AuthCache> {
  const { data: row } = await supabase
    .from("fabi_auth_cache")
    .select("token, token_expires_at, brand_uid, company_uid, store_uids")
    .eq("id", "singleton")
    .single();

  if (row && row.token && row.token_expires_at) {
    const expiresMs = new Date(row.token_expires_at).getTime();
    if (expiresMs - Date.now() > REFRESH_BEFORE_EXPIRY_MS) {
      return row as AuthCache;
    }
  }
  return login();
}

/**
 * Wrap a request that needs auth. Re-logs in once on 401.
 */
async function authedFetch<T>(
  path: string,
  params: Record<string, string | number>
): Promise<T> {
  let auth = await getValidAuth();

  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  let res = await fetch(url.toString(), { headers: baseHeaders(auth.token) });

  if (res.status === 401) {
    auth = await login();
    res = await fetch(url.toString(), { headers: baseHeaders(auth.token) });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FABi ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/* ── Date helpers (Asia/Ho_Chi_Minh) ── */

const VN_TZ = "Asia/Ho_Chi_Minh";

/** Returns "YYYY-MM-DD" for a given Date in VN timezone. */
export function vnDateString(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

/** N days back from today in VN tz (inclusive of today). */
export function vnDateRange(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(vnDateString(d));
  }
  return out;
}

/* ── Report fetchers ── */

export type DailyOverview = {
  date: string;
  revenue_net: number;
  revenue_gross: number;
  discount_amount: number;
  invoice_count: number;
};

/**
 * Fetch sale-summary overview for a single date (VN local day, 7am cutoff).
 */
export async function getOverview(date: string): Promise<DailyOverview> {
  const auth = await getValidAuth();
  const params = {
    brand_uid: auth.brand_uid,
    company_uid: auth.company_uid,
    list_store_uid: auth.store_uids.join(","),
    start_date: date,
    end_date: date,
    store_open_at: "07:00",
  };
  const json = await authedFetch<OverviewResponse>(
    "/api/v1/reports/sale-summary/overview",
    params
  );
  const d = json.data || {};
  return {
    date,
    revenue_net: d.revenue_net || 0,
    revenue_gross: d.revenue_gross || 0,
    discount_amount: d.discount_amount || 0,
    invoice_count: d.total_sales || 0,
  };
}

/**
 * Fetch overview for many days. Done sequentially to be polite to their API.
 */
export async function getOverviewRange(dates: string[]): Promise<DailyOverview[]> {
  const out: DailyOverview[] = [];
  for (const date of dates) {
    try {
      const row = await getOverview(date);
      out.push(row);
    } catch (e) {
      // Don't let a single bad day kill the whole sync
      console.error(`FABi overview ${date} failed:`, e);
      out.push({ date, revenue_net: 0, revenue_gross: 0, discount_amount: 0, invoice_count: 0 });
    }
  }
  return out;
}

/**
 * Persist overview rows into fabi_daily_sales.
 */
export async function persistDailySales(rows: DailyOverview[]): Promise<void> {
  if (!rows.length) return;
  const upserts = rows.map((r) => ({
    date: r.date,
    store_uid: "all",
    revenue_net: r.revenue_net,
    revenue_gross: r.revenue_gross,
    discount_amount: r.discount_amount,
    invoice_count: r.invoice_count,
    fetched_at: new Date().toISOString(),
  }));
  await supabase.from("fabi_daily_sales").upsert(upserts, { onConflict: "date,store_uid" });
}

/**
 * Read last N days from DB (most recent last).
 */
export async function readDailySales(days: number): Promise<DailyOverview[]> {
  const range = vnDateRange(days);
  const { data } = await supabase
    .from("fabi_daily_sales")
    .select("date, revenue_net, revenue_gross, discount_amount, invoice_count")
    .gte("date", range[0])
    .lte("date", range[range.length - 1])
    .order("date", { ascending: true });

  const byDate = new Map<string, DailyOverview>();
  for (const r of data || []) {
    byDate.set(r.date, {
      date: r.date,
      revenue_net: r.revenue_net || 0,
      revenue_gross: r.revenue_gross || 0,
      discount_amount: r.discount_amount || 0,
      invoice_count: r.invoice_count || 0,
    });
  }
  // Fill gaps with zeros so the chart renders a continuous line
  return range.map(
    (date) =>
      byDate.get(date) || {
        date,
        revenue_net: 0,
        revenue_gross: 0,
        discount_amount: 0,
        invoice_count: 0,
      }
  );
}
