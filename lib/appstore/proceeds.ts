import { sign } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { supabase } from "@/lib/supabase";

// Apple's real payout share, read from App Store Connect Sales Reports.
// Apple keeps 15% (Small Business Program) after first deducting local
// taxes in VAT countries, so the share kept is below 85% there.
const ASC_SALES_URL = "https://api.appstoreconnect.apple.com/v1/salesReports";
const REPORT_PREFIX = "__asc_sales_report__";
const SUMMARY_ID = "__asc_proceeds_summary__";
const SUMMARY_TTL_MS = 12 * 3600000;
const KEPT_WINDOW_DAYS = 14;
const HISTORY_VN_DAYS = 31; // covers the dashboard's 30-day charts
// Daily reports can say "no sales" before a late territory is published.
const SETTLED_DAILY_AGE_DAYS = 3;
const SETTLED_MONTHLY_AGE_DAYS = 10;
const FETCH_CONCURRENCY = 4;
export const DEFAULT_KEPT_SHARE = 0.85;
// Owner-dashboard apps by App Store SKU (the reports' Parent Identifier).
export const OWNER_APP_SKUS = { GrailScan: "grailscan-001", AskMed: "askmed" } as const;

type MoneyByCurrency = Record<string, number>;
type SkuTotals = { proceeds: MoneyByCurrency; price: MoneyByCurrency };
type SalesReport = Record<string, SkuTotals>;
type Frequency = "DAILY" | "MONTHLY";
type ReportResult = { status: "ok"; report: SalesReport } | { status: "none" } | { status: "pending" };

export type AppleProceeds = {
  kept_share: Record<string, number>; // owner app name -> proceeds / customer price
  kept_share_by_sku: Record<string, number>;
  kept_share_by_date: Record<keyof typeof OWNER_APP_SKUS, Record<string, number>>; // Vietnam day -> trailing 14-day share
  window: { from: string; to: string } | null; // US Pacific report days
  ytd_year: number;
  ytd_through: string | null;
  ytd_proceeds_usd: number; // every app on the account
  ytd_proceeds_vnd: number;
  usd_vnd: number;
  source: "apple" | "saved" | "default"; // saved = last known value after a failed refresh
  updated_at: string | null;
  error?: string;
};

function salesConfig() {
  const keyId = process.env.ASC_SALES_KEY_ID;
  const issuerId = process.env.ASC_SALES_ISSUER_ID;
  const privateKey = process.env.ASC_SALES_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const vendorNumber = process.env.ASC_VENDOR_NUMBER;
  if (!keyId || !issuerId || !privateKey || !vendorNumber) {
    throw new Error("App Store Connect sales reports are not configured");
  }
  return { keyId, issuerId, privateKey, vendorNumber };
}

function salesToken(config: ReturnType<typeof salesConfig>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "ES256", kid: config.keyId, typ: "JWT" })}.${encode({
    iss: config.issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1",
  })}`;
  // Pass the PEM itself: Cloudflare workerd rejects a KeyObject inside the
  // { key, dsaEncoding } options (Node accepts both).
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${signature.toString("base64url")}`;
}

/**
 * Sum a SALES SUMMARY TSV by app SKU. Refund rows have negative units and a
 * negative customer price, so signed units times absolute amounts subtract them.
 */
export function parseSalesReport(tsv: string): SalesReport {
  const [header, ...lines] = tsv.trim().split(/\r?\n/);
  const columns = (header || "").split("\t");
  const at = (name: string) => columns.indexOf(name);
  const index = {
    sku: at("SKU"), parent: at("Parent Identifier"), units: at("Units"),
    proceeds: at("Developer Proceeds"), proceedsCurrency: at("Currency of Proceeds"),
    price: at("Customer Price"), priceCurrency: at("Customer Currency"),
  };
  if (Object.values(index).some(i => i < 0)) throw new Error("Unexpected sales report columns");
  const report: SalesReport = {};
  for (const line of lines) {
    const cells = line.split("\t");
    const units = Number(cells[index.units]);
    const proceeds = Number(cells[index.proceeds]);
    const price = Number(cells[index.price]);
    if (!Number.isFinite(units) || !Number.isFinite(proceeds) || !Number.isFinite(price)) continue;
    if (proceeds === 0 && price === 0) continue;
    const sku = cells[index.parent]?.trim() || cells[index.sku]?.trim() || "unknown";
    const totals = (report[sku] ??= { proceeds: {}, price: {} });
    const proceedsCurrency = cells[index.proceedsCurrency]?.trim() || "USD";
    const priceCurrency = cells[index.priceCurrency]?.trim() || proceedsCurrency;
    totals.proceeds[proceedsCurrency] = (totals.proceeds[proceedsCurrency] || 0) + units * Math.abs(proceeds);
    totals.price[priceCurrency] = (totals.price[priceCurrency] || 0) + units * Math.abs(price);
  }
  return report;
}

async function fetchSalesReport(
  config: ReturnType<typeof salesConfig>,
  frequency: Frequency,
  reportDate: string
): Promise<ReportResult> {
  const url = new URL(ASC_SALES_URL);
  url.searchParams.set("filter[frequency]", frequency);
  url.searchParams.set("filter[reportType]", "SALES");
  url.searchParams.set("filter[reportSubType]", "SUMMARY");
  url.searchParams.set("filter[vendorNumber]", config.vendorNumber);
  // Apple versions differ by frequency: daily SUMMARY is 1_1, monthly is 1_0.
  url.searchParams.set("filter[version]", frequency === "DAILY" ? "1_1" : "1_0");
  url.searchParams.set("filter[reportDate]", reportDate);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${salesToken(config)}`, Accept: "application/a-gzip" },
    cache: "no-store",
  });
  if (response.status === 404) {
    const detail = await response.text();
    return /not available yet/i.test(detail) ? { status: "pending" } : { status: "none" };
  }
  if (!response.ok) throw new Error(`App Store sales report failed (${frequency} ${reportDate}): HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  const text = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body).toString("utf8") : body.toString("utf8");
  return { status: "ok", report: parseSalesReport(text) };
}

const reportId = (frequency: Frequency, date: string) => `${REPORT_PREFIX}:${frequency}:${date}`;

function pacificToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

/**
 * Read reports from the permanent Supabase cache and fetch only missing or
 * still-unsettled ones. Published reports never change, so each is fetched once.
 */
async function loadReports(
  config: ReturnType<typeof salesConfig>,
  requests: { frequency: Frequency; date: string; settled: boolean }[]
): Promise<Map<string, ReportResult>> {
  const ids = requests.map(r => reportId(r.frequency, r.date));
  const { data, error } = await supabase.from("pinterest_topics")
    .select("id,description_template").in("id", ids);
  if (error) throw new Error("Cannot read saved App Store sales reports");
  const results = new Map<string, ReportResult>();
  for (const row of data || []) {
    const saved = JSON.parse(row.description_template) as { none?: boolean; report?: SalesReport };
    results.set(row.id, saved.none ? { status: "none" } : { status: "ok", report: saved.report || {} });
  }
  const missing = requests.filter(r => !results.has(reportId(r.frequency, r.date)));
  const fetched = await mapLimit(missing, FETCH_CONCURRENCY, r => fetchSalesReport(config, r.frequency, r.date));
  const stamp = new Date().toISOString();
  const rows = missing.flatMap((r, i) => {
    const result = fetched[i];
    results.set(reportId(r.frequency, r.date), result);
    // Cache only settled periods: Apple can still publish late territories.
    if (result.status === "pending" || !r.settled) return [];
    return [{
      id: reportId(r.frequency, r.date), category: "system", title_template: "App Store sales report",
      description_template: JSON.stringify(result.status === "ok" ? { report: result.report } : { none: true }),
      prompt_seed: stamp, times_used: 0,
    }];
  });
  if (rows.length) {
    const { error: writeError } = await supabase.from("pinterest_topics").upsert(rows, { onConflict: "id" });
    if (writeError) throw new Error("Cannot save App Store sales reports");
  }
  return results;
}

async function usdRates(): Promise<Record<string, number>> {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
  if (!response.ok) throw new Error(`FX rates failed: HTTP ${response.status}`);
  const json = (await response.json()) as { rates?: Record<string, number> };
  if (!json.rates?.VND) throw new Error("FX rates unavailable");
  return { ...json.rates, USD: 1 };
}

function toUsd(amounts: MoneyByCurrency, rates: Record<string, number>): number {
  return Object.entries(amounts).reduce((sum, [currency, amount]) => {
    const rate = rates[currency];
    if (!(rate > 0)) throw new Error(`No FX rate for ${currency}`);
    return sum + amount / rate;
  }, 0);
}

type UsdTotals = Record<string, { proceeds: number; price: number }>;

function addTotals(target: UsdTotals, report: SalesReport | UsdTotals, rates?: Record<string, number>) {
  for (const [sku, totals] of Object.entries(report)) {
    const sum = (target[sku] ??= { proceeds: 0, price: 0 });
    sum.proceeds += typeof totals.proceeds === "number" ? totals.proceeds : toUsd(totals.proceeds, rates!);
    sum.price += typeof totals.price === "number" ? totals.price : toUsd(totals.price, rates!);
  }
}

function sharesBySku(totals: UsdTotals): Record<string, number> {
  return Object.fromEntries(Object.entries(totals)
    .filter(([, sum]) => sum.price > 0)
    .map(([sku, sum]) => [sku, sum.proceeds / sum.price]));
}

export function keptShareForApps(bySku: Record<string, number>, previous?: Record<string, number>) {
  return Object.fromEntries(Object.entries(OWNER_APP_SKUS).map(([app, sku]) => [
    app, bySku[sku] ?? previous?.[app] ?? DEFAULT_KEPT_SHARE,
  ])) as Record<keyof typeof OWNER_APP_SKUS, number>;
}

async function computeAppleProceeds(previous: AppleProceeds | null, now = new Date()): Promise<AppleProceeds> {
  const config = salesConfig();
  const today = pacificToday(now);
  const settledBefore = addDays(today, -SETTLED_DAILY_AGE_DAYS);
  // Each dashboard (Vietnam) day uses the 14 report days ending on that date,
  // capped at the newest published report, so past profit uses the share of its time.
  const vnToday = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const vnDays = daysBetween(addDays(vnToday, -HISTORY_VN_DAYS), vnToday);
  const recent = daysBetween(addDays(vnDays[0], -(KEPT_WINDOW_DAYS - 1)), addDays(today, -1)).reverse();
  const recentReports = await loadReports(config, recent.map(date => ({ frequency: "DAILY", date, settled: date <= settledBefore })));
  const through = recent.find(date => recentReports.get(reportId("DAILY", date))?.status === "ok");
  if (!through) throw new Error("No recent App Store sales report");

  // Year to date: whole published months, then daily reports for the rest.
  const year = Number(through.slice(0, 4));
  const months = Array.from({ length: Number(through.slice(5, 7)) - 1 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const monthSettled = (month: string) => monthEnd(month) <= addDays(today, -SETTLED_MONTHLY_AGE_DAYS);
  const monthReports = await loadReports(config, months.map(month => ({ frequency: "MONTHLY", date: month, settled: monthSettled(month) })));
  const monthStatus = (month: string) => monthReports.get(reportId("MONTHLY", month))?.status;
  const monthlyMonths = months.filter(month => monthStatus(month) === "ok");
  const dailyMonths = months.filter(month => monthStatus(month) !== "ok" && !(monthStatus(month) === "none" && monthSettled(month)));
  const ytdDays = [
    ...dailyMonths.flatMap(month => daysBetween(`${month}-01`, monthEnd(month))),
    ...daysBetween(`${through.slice(0, 7)}-01`, through),
  ];
  const dailyReports = await loadReports(config, ytdDays.filter(date => !recent.includes(date))
    .map(date => ({ frequency: "DAILY", date, settled: date <= settledBefore })));

  const rates = await usdRates();
  const dayTotals = new Map<string, UsdTotals>();
  for (const date of recent) {
    const result = recentReports.get(reportId("DAILY", date));
    const totals: UsdTotals = {};
    if (result?.status === "ok") addTotals(totals, result.report, rates);
    dayTotals.set(date, totals);
  }
  const windowShares = (end: string) => {
    const totals: UsdTotals = {};
    for (const date of daysBetween(addDays(end, -(KEPT_WINDOW_DAYS - 1)), end)) addTotals(totals, dayTotals.get(date) || {});
    return sharesBySku(totals);
  };
  const keptBySku = windowShares(through);
  const keptShare = keptShareForApps(keptBySku, previous?.kept_share);
  // Days before an app's first sale have no revenue, so the current share is harmless there.
  const byDate = Object.fromEntries(Object.keys(OWNER_APP_SKUS).map(app => [app, {} as Record<string, number>])) as Record<keyof typeof OWNER_APP_SKUS, Record<string, number>>;
  for (const date of vnDays) {
    const shares = keptShareForApps(windowShares(date < through ? date : through), keptShare);
    for (const app of Object.keys(byDate) as (keyof typeof OWNER_APP_SKUS)[]) byDate[app][date] = shares[app];
  }

  const ytd: UsdTotals = {};
  for (const month of monthlyMonths) {
    const result = monthReports.get(reportId("MONTHLY", month));
    if (result?.status === "ok") addTotals(ytd, result.report, rates);
  }
  for (const date of ytdDays) {
    const result = recentReports.get(reportId("DAILY", date)) ?? dailyReports.get(reportId("DAILY", date));
    if (result?.status === "ok") addTotals(ytd, result.report, rates);
  }
  const ytdUsd = Object.values(ytd).reduce((sum, value) => sum + value.proceeds, 0);
  return {
    kept_share: keptShare,
    kept_share_by_sku: keptBySku,
    kept_share_by_date: byDate,
    window: { from: addDays(through, -(KEPT_WINDOW_DAYS - 1)), to: through },
    ytd_year: year,
    ytd_through: through,
    ytd_proceeds_usd: ytdUsd,
    ytd_proceeds_vnd: ytdUsd * rates.VND,
    usd_vnd: rates.VND,
    source: "apple",
    updated_at: now.toISOString(),
  };
}

function defaultProceeds(error?: string): AppleProceeds {
  return {
    kept_share: keptShareForApps({}), kept_share_by_sku: {}, kept_share_by_date: { GrailScan: {}, AskMed: {} }, window: null,
    ytd_year: new Date().getUTCFullYear(), ytd_through: null, ytd_proceeds_usd: 0, ytd_proceeds_vnd: 0,
    usd_vnd: 0, source: "default", updated_at: null, error,
  };
}

/**
 * Cached Apple proceeds (refreshed about every 12 hours). Never throws: a
 * failed refresh keeps the last saved value, then falls back to 85%.
 */
export async function getAppleProceeds(): Promise<AppleProceeds> {
  let saved: AppleProceeds | null = null;
  try {
    const { data } = await supabase.from("pinterest_topics")
      .select("description_template").eq("id", SUMMARY_ID).maybeSingle();
    if (data?.description_template) saved = JSON.parse(data.description_template);
  } catch {
    saved = null;
  }
  if (saved?.updated_at && Date.now() - Date.parse(saved.updated_at) < SUMMARY_TTL_MS) return saved;
  try {
    const fresh = await computeAppleProceeds(saved);
    await supabase.from("pinterest_topics").upsert({
      id: SUMMARY_ID, category: "system", title_template: "App Store proceeds summary",
      description_template: JSON.stringify(fresh), prompt_seed: fresh.updated_at, times_used: 0,
    }, { onConflict: "id" });
    return fresh;
  } catch (error) {
    const message = error instanceof Error ? error.message : "App Store sales reports unavailable";
    console.error("Apple proceeds refresh failed", message);
    return saved ? { ...saved, source: "saved", error: message } : defaultProceeds(message);
  }
}

export const testHelpers = { computeAppleProceeds };
