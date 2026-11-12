import { sign } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { db } from "@/lib/db";

// Google Play's real payout share for AskMed Android, read from the Play
// Console bulk-report bucket (read-only Cloud Storage access).
// - Earnings reports (earnings/earnings_YYYYMM_*.zip, monthly, published early
//   the next month) list Google's actual fee and the taxes Google keeps per order.
// - Estimated sales reports (sales/salesreport_YYYYMM.zip, updated daily) list
//   the real taxes per order; Google's fee there is the 15% subscription rate.
// Kept share = what Google pays out ÷ what the buyer paid (RevenueCat revenue).
export const DEFAULT_PLAY_FEE = 0.15;
export const DEFAULT_PLAY_KEPT_SHARE = 1 - DEFAULT_PLAY_FEE;
const SUMMARY_ID = "__play_proceeds_summary__";
const SUMMARY_TTL_MS = 12 * 3600000;
const KEPT_WINDOW_DAYS = 14;
const HISTORY_VN_DAYS = 31;
const DEFAULT_BUCKET = "pubsite_prod_8915566263901774470";
const DEFAULT_PACKAGE = "com.loopstudio.askmed";
const GCS = "https://storage.googleapis.com/storage/v1/b";

/** Per report day: what buyers paid and what Google pays out, both in USD. */
type DayTotals = Record<string, { paid: number; kept: number }>;

export type GooglePlayProceeds = {
  kept_share: number;
  kept_share_by_date: Record<string, number>; // Vietnam day -> trailing 14-day share
  window: { from: string; to: string } | null; // report days
  earnings_months: string[]; // months whose share comes from Google's final earnings report
  sales_through: string | null; // newest day seen in the daily sales report
  source: "google" | "saved" | "default";
  updated_at: string | null;
  error?: string;
};

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function playConfig() {
  const raw = process.env.GOOGLE_PLAY_REPORTS_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Google Play reports are not connected");
  const account = JSON.parse(raw) as ServiceAccount;
  if (!account.client_email || !account.private_key) throw new Error("Google Play service account is incomplete");
  return {
    account: { ...account, private_key: account.private_key.replace(/\\n/g, "\n") },
    bucket: process.env.GOOGLE_PLAY_REPORTS_BUCKET || DEFAULT_BUCKET,
    packageName: process.env.GOOGLE_PLAY_PACKAGE || DEFAULT_PACKAGE,
  };
}

async function accessToken(account: ServiceAccount): Promise<string> {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: account.client_email, scope: "https://www.googleapis.com/auth/devstorage.read_only",
    aud: tokenUri, iat: now, exp: now + 3600,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), account.private_key).toString("base64url");
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!response.ok || !json.access_token) throw new Error(`Google sign-in failed: ${json.error_description || `HTTP ${response.status}`}`);
  return json.access_token;
}

async function listObjects(bucket: string, prefix: string, token: string): Promise<string[]> {
  const names: string[] = [];
  let pageToken = "";
  do {
    const url = new URL(`${GCS}/${bucket}/o`);
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("fields", "items(name),nextPageToken");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`Play report list failed (${prefix}): HTTP ${response.status}`);
    const json = (await response.json()) as { items?: { name: string }[]; nextPageToken?: string };
    names.push(...(json.items || []).map(item => item.name));
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return names;
}

async function downloadObject(bucket: string, name: string, token: string): Promise<Buffer> {
  const response = await fetch(`${GCS}/${bucket}/o/${encodeURIComponent(name)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`Play report download failed (${name}): HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** The CSV files inside a Play report zip (stored or deflated entries). */
export function unzipTexts(zip: Buffer): string[] {
  if (zip.readUInt32LE(0) !== 0x04034b50) return [decodeText(zip)];
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("Unreadable Play report zip");
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const texts: string[] = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("Unreadable Play report zip");
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    at += 46 + nameLength + extraLength + commentLength;
    if (!/\.csv$/i.test(name)) continue;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported zip method ${method}`);
    texts.push(decodeText(method === 8 ? inflateRawSync(data) : data));
  }
  return texts;
}

function decodeText(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  const text = bytes.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** RFC 4180 CSV rows (quoted fields may hold commas, quotes and line breaks). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(cell => cell !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(cell => cell !== "")) rows.push(row);
  const [header = [], ...body] = rows;
  const names = header.map(name => name.trim());
  return body.map(cells => Object.fromEntries(names.map((name, i) => [name, (cells[i] ?? "").trim()])));
}

const amount = (value: string | undefined) => Number(String(value ?? "").replace(/,/g, "")) || 0;

/** "Nov 3, 2026" or "2026-11-03" -> "2026-11-03". */
export function reportDate(value: string | undefined): string | null {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = Date.parse(`${text} UTC`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function addTo(days: DayTotals, date: string, paid: number, kept: number) {
  const day = (days[date] ??= { paid: 0, kept: 0 });
  day.paid += paid;
  day.kept += kept;
}

/**
 * Earnings report: per order, the Charge row is what the buyer paid; Tax and
 * Google fee rows are what Google kept. Refund rows are left out (owner
 * accounting already deducts refunds on their own).
 */
export function parseEarnings(rows: Record<string, string>[], packageName: string, rates: Record<string, number>): DayTotals {
  const orders = new Map<string, { date: string | null; currency: string; paid: number; kept: number }>();
  for (const row of rows) {
    if (row["Product id"] && row["Product id"] !== packageName) continue;
    const type = (row["Transaction Type"] || "").toLowerCase();
    if (type.includes("refund")) continue;
    const id = row["Description"];
    if (!id) continue;
    const order = orders.get(id) ?? { date: null, currency: row["Merchant Currency"] || "USD", paid: 0, kept: 0 };
    const value = amount(row["Amount (Merchant Currency)"]);
    if (type === "charge") { order.paid += value; order.date = reportDate(row["Transaction Date"]); }
    order.kept += value; // Charge (+), Tax (−), Google fee (−)
    orders.set(id, order);
  }
  const days: DayTotals = {};
  for (const order of orders.values()) {
    const rate = rates[order.currency];
    if (!order.date || !(order.paid > 0) || !(rate > 0)) continue;
    addTo(days, order.date, order.paid / rate, order.kept / rate);
  }
  return days;
}

/** Estimated sales report: real taxes per order; Google's fee is 15% of the rest. */
export function parseSales(rows: Record<string, string>[], packageName: string, rates: Record<string, number>): DayTotals {
  const days: DayTotals = {};
  for (const row of rows) {
    if (row["Product ID"] && row["Product ID"] !== packageName) continue;
    if ((row["Financial Status"] || "").toLowerCase() !== "charged") continue;
    const date = reportDate(row["Order Charged Date"]);
    const paid = amount(row["Charged Amount"]);
    const rate = rates[row["Currency of Sale"] || "USD"];
    if (!date || !(paid > 0) || !(rate > 0)) continue;
    const kept = (paid - amount(row["Taxes Collected"])) * (1 - DEFAULT_PLAY_FEE);
    addTo(days, date, paid / rate, kept / rate);
  }
  return days;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

async function usdRates(): Promise<Record<string, number>> {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
  if (!response.ok) throw new Error(`FX rates failed: HTTP ${response.status}`);
  const json = (await response.json()) as { rates?: Record<string, number> };
  if (!json.rates?.VND) throw new Error("FX rates unavailable");
  return { ...json.rates, USD: 1 };
}

/** Earnings months win over the estimated sales report for the same month. */
export function sharesByVnDay(earnings: Record<string, DayTotals>, sales: Record<string, DayTotals>, vnDays: string[]) {
  const days: DayTotals = {};
  const months = new Set([...Object.keys(earnings), ...Object.keys(sales)]);
  for (const month of months) {
    for (const [date, totals] of Object.entries(earnings[month] ?? sales[month] ?? {})) {
      addTo(days, date, totals.paid, totals.kept);
    }
  }
  const through = Object.keys(days).sort().pop() ?? null;
  if (!through) return null;
  const windowShare = (end: string) => {
    let paid = 0, kept = 0;
    for (const date of daysBetween(addDays(end, -(KEPT_WINDOW_DAYS - 1)), end)) {
      paid += days[date]?.paid || 0;
      kept += days[date]?.kept || 0;
    }
    return paid > 0 ? kept / paid : null;
  };
  const current = windowShare(through) ?? DEFAULT_PLAY_KEPT_SHARE;
  // Days before the first Android sale have no revenue, so the current share is harmless there.
  const byDate = Object.fromEntries(vnDays.map(date => [date, windowShare(date < through ? date : through) ?? current]));
  return { current, byDate, through };
}

async function computePlayProceeds(now = new Date()): Promise<GooglePlayProceeds> {
  const config = playConfig();
  const token = await accessToken(config.account);
  const vnToday = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const vnDays = daysBetween(addDays(vnToday, -HISTORY_VN_DAYS), vnToday);
  const months = [...new Set(daysBetween(addDays(vnDays[0], -(KEPT_WINDOW_DAYS - 1)), vnToday).map(date => date.slice(0, 7).replace("-", "")))];
  const rates = await usdRates();
  const earnings: Record<string, DayTotals> = {};
  const sales: Record<string, DayTotals> = {};
  for (const month of months) {
    const earningFiles = await listObjects(config.bucket, `earnings/earnings_${month}`, token);
    if (earningFiles.length) {
      const rows = (await Promise.all(earningFiles.map(name => downloadObject(config.bucket, name, token))))
        .flatMap(zip => unzipTexts(zip)).flatMap(parseCsv);
      earnings[month] = parseEarnings(rows, config.packageName, rates);
      continue;
    }
    const salesFiles = await listObjects(config.bucket, `sales/salesreport_${month}`, token);
    if (salesFiles.length) {
      const rows = (await Promise.all(salesFiles.map(name => downloadObject(config.bucket, name, token))))
        .flatMap(zip => unzipTexts(zip)).flatMap(parseCsv);
      sales[month] = parseSales(rows, config.packageName, rates);
    }
  }
  const shares = sharesByVnDay(earnings, sales, vnDays);
  if (!shares) throw new Error("No AskMed sales in the Google Play reports yet");
  const salesDays = Object.values(sales).flatMap(days => Object.keys(days)).sort();
  return {
    kept_share: shares.current,
    kept_share_by_date: shares.byDate,
    window: { from: addDays(shares.through, -(KEPT_WINDOW_DAYS - 1)), to: shares.through },
    earnings_months: Object.keys(earnings).sort(),
    sales_through: salesDays.pop() ?? null,
    source: "google",
    updated_at: now.toISOString(),
  };
}

function defaultPlayProceeds(error?: string): GooglePlayProceeds {
  return {
    kept_share: DEFAULT_PLAY_KEPT_SHARE, kept_share_by_date: {}, window: null, earnings_months: [],
    sales_through: null, source: "default", updated_at: null, error,
  };
}

/**
 * Cached Google Play proceeds (refreshed about every 12 hours). Never throws:
 * a failed refresh keeps the last saved value, then falls back to 15%.
 */
export async function getGooglePlayProceeds(): Promise<GooglePlayProceeds> {
  let saved: GooglePlayProceeds | null = null;
  try {
    const { data } = await db.from("pinterest_topics")
      .select("description_template").eq("id", SUMMARY_ID).maybeSingle();
    if (data?.description_template) saved = JSON.parse(data.description_template);
  } catch {
    saved = null;
  }
  if (saved?.updated_at && Date.now() - Date.parse(saved.updated_at) < SUMMARY_TTL_MS) return saved;
  try {
    const fresh = await computePlayProceeds();
    await db.from("pinterest_topics").upsert({
      id: SUMMARY_ID, category: "system", title_template: "Google Play proceeds summary",
      description_template: JSON.stringify(fresh), prompt_seed: fresh.updated_at, times_used: 0,
    }, { onConflict: "id" });
    return fresh;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Play reports unavailable";
    if (saved) console.error("Google Play proceeds refresh failed", message);
    return saved ? { ...saved, source: "saved", error: message } : defaultPlayProceeds(message);
  }
}

export const testHelpers = { computePlayProceeds };
