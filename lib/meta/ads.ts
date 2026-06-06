/**
 * Meta (Facebook) Marketing API — ad spend for today (GMT+7).
 *
 * Env vars:
 *   META_ACCESS_TOKEN     — token with ads_read (ideally a non-expiring System User token)
 *   META_AD_ACCOUNT_ID    — e.g. "act_1234567890" (act_ prefix optional, we normalize)
 *
 * Spend is returned in the ad account's billing currency. We convert to USD
 * with a live rate so it lines up with RevenueCat (USD) for profit math.
 */

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const VN_TZ = "Asia/Ho_Chi_Minh";

export type MetaSpend = {
  configured: boolean;
  spend_native: number; // spend in account currency
  spend_usd: number; // converted to USD
  currency: string; // account currency, e.g. "VND"
  usd_rate: number; // 1 USD = usd_rate <currency>
  date: string; // YYYY-MM-DD (GMT+7)
  error?: string;
};

function vnDateIso(d: Date = new Date()): string {
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

function normalizeAccountId(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

/**
 * Live USD -> <currency> rate. Returns how many <currency> per 1 USD.
 * Uses open.er-api.com (free, no key). USD returns 1.
 */
async function getUsdRate(currency: string): Promise<number> {
  if (currency === "USD") return 1;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      // cache an hour — FX doesn't move enough to matter for ad-spend math
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`fx ${res.status}`);
    const json = await res.json();
    const rate = json?.rates?.[currency];
    if (typeof rate === "number" && rate > 0) return rate;
    throw new Error(`no rate for ${currency}`);
  } catch {
    // Fallback approximate USD->VND so the dashboard still renders
    if (currency === "VND") return 25400;
    return 1;
  }
}

/**
 * Daily Meta ad spend (USD) over a date range, keyed by YYYY-MM-DD in the ad
 * account's timezone (GMT+7 here). Matches the GMT+7 day boundary used by the
 * rest of the dashboard and the DB-sourced daily revenue.
 */
export async function getMetaSpendByDay(
  startIso: string,
  endIso: string
): Promise<Record<string, number>> {
  const token = process.env.META_ACCESS_TOKEN;
  const rawAccount = process.env.META_AD_ACCOUNT_ID;
  if (!token || !rawAccount) return {};
  const accountId = normalizeAccountId(rawAccount);

  try {
    const acctRes = await fetch(
      `${GRAPH_BASE}/${accountId}?fields=currency&access_token=${encodeURIComponent(token)}`
    );
    const currency: string = (await acctRes.json())?.currency || "USD";
    const rate = await getUsdRate(currency);

    const timeRange = encodeURIComponent(JSON.stringify({ since: startIso, until: endIso }));
    const res = await fetch(
      `${GRAPH_BASE}/${accountId}/insights?fields=spend&time_increment=1&limit=100&time_range=${timeRange}&access_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return {};
    const json = await res.json();

    const out: Record<string, number> = {};
    for (const row of json?.data || []) {
      const date: string = row.date_start; // GMT+7 calendar date
      const native = row.spend ? parseFloat(row.spend) : 0;
      if (date) out[date] = rate > 0 ? native / rate : 0;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Fetch today's (GMT+7) Meta ad spend for the configured account,
 * converted to USD.
 */
export async function getTodayMetaSpend(): Promise<MetaSpend> {
  const token = process.env.META_ACCESS_TOKEN;
  const rawAccount = process.env.META_AD_ACCOUNT_ID;
  const date = vnDateIso();

  const empty: MetaSpend = {
    configured: false,
    spend_native: 0,
    spend_usd: 0,
    currency: "USD",
    usd_rate: 1,
    date,
  };

  if (!token || !rawAccount) return empty;

  const accountId = normalizeAccountId(rawAccount);

  try {
    // 1) Account currency
    const acctRes = await fetch(
      `${GRAPH_BASE}/${accountId}?fields=currency&access_token=${encodeURIComponent(token)}`
    );
    if (!acctRes.ok) {
      const t = await acctRes.text();
      return { ...empty, configured: true, error: `account ${acctRes.status}: ${t.slice(0, 150)}` };
    }
    const acctJson = await acctRes.json();
    const currency: string = acctJson?.currency || "USD";

    // 2) Today's spend (time_range in account timezone; for a VN business the
    //    account tz is GMT+7, so passing the GMT+7 date lines up).
    const timeRange = encodeURIComponent(JSON.stringify({ since: date, until: date }));
    const insRes = await fetch(
      `${GRAPH_BASE}/${accountId}/insights?fields=spend&time_range=${timeRange}&access_token=${encodeURIComponent(token)}`
    );
    if (!insRes.ok) {
      const t = await insRes.text();
      return { ...empty, configured: true, currency, error: `insights ${insRes.status}: ${t.slice(0, 150)}` };
    }
    const insJson = await insRes.json();
    const row = (insJson?.data || [])[0];
    const spendNative = row?.spend ? parseFloat(row.spend) : 0;

    const usdRate = await getUsdRate(currency);
    const spendUsd = usdRate > 0 ? spendNative / usdRate : 0;

    return {
      configured: true,
      spend_native: spendNative,
      spend_usd: spendUsd,
      currency,
      usd_rate: usdRate,
      date,
    };
  } catch (e) {
    return { ...empty, configured: true, error: e instanceof Error ? e.message : "meta fetch failed" };
  }
}
