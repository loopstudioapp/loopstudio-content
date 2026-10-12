import { gunzipSync } from "node:zlib";
import { db } from "@/lib/db";
import { salesConfig, salesToken } from "@/lib/appstore/proceeds";

// AskMed revenue split into Meta ads and organic, from Apple's App Store
// Analytics Reports ("App Store Purchases Standard", sales by Source Type).
// Owner rules: Meta = App Referrer + Web Referrer; Organic = App Store Search +
// App Store Browse; Institutional, Unavailable and any other source type are
// shared in that same day's Meta:Organic ratio. Saved per Apple report date in
// D1 `askmed_channel_daily`; Apple date D is shown on Vietnam day D.
const ASC_API = "https://api.appstoreconnect.apple.com";
export const ASKMED_APPLE_ID = "6776077826";
export const REPORT_NAME = "App Store Purchases Standard";
// Report requests created for AskMed (one-time history first, so ongoing wins).
const REPORT_REQUESTS = [
  { kind: "ONE_TIME_SNAPSHOT", id: "f0f20834-da2e-4469-b9d0-dbf497410c9f" },
  { kind: "ONGOING", id: "8114e534-d05c-4c82-b814-3a6395fcd6a0" },
] as const;
const ONGOING_WINDOW_DAYS = 35;
const FETCH_CONCURRENCY = 4;
const ESTIMATE_DAYS = 7;

const SOURCE_COLUMNS = [
  "app_referrer_usd", "web_referrer_usd", "app_store_search_usd", "app_store_browse_usd",
  "institutional_usd", "unavailable_usd", "other_usd",
] as const;
type SourceColumn = (typeof SOURCE_COLUMNS)[number];
export type ChannelTotals = Record<SourceColumn, number>;
export type ChannelDay = ChannelTotals & { date: string };
/** One Vietnam day of AskMed revenue: meta + organic always equals RevenueCat revenue. */
export type AskMedSplitDay = { meta: number; organic: number; meta_share: number; estimated: boolean };

const emptyTotals = (): ChannelTotals =>
  Object.fromEntries(SOURCE_COLUMNS.map(column => [column, 0])) as ChannelTotals;

// Headers and source types compared without case, spacing or punctuation.
const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function sourceColumn(sourceType: string): SourceColumn {
  const key = squash(sourceType);
  if (key === "appreferrer") return "app_referrer_usd";
  if (key === "webreferrer") return "web_referrer_usd";
  if (key === "appstoresearch") return "app_store_search_usd";
  if (key === "appstorebrowse") return "app_store_browse_usd";
  if (key.startsWith("institutional")) return "institutional_usd";
  if (key === "unavailable") return "unavailable_usd";
  return "other_usd";
}

/** "2026-10-11", "2026-10-11 00:00:00", "10/11/2026" or "20261011" -> "2026-10-11". */
function reportDate(value: string): string | null {
  const text = value.trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * Sum an "App Store Purchases Standard" TSV by Date and Source Type for one
 * app. Columns are found by header name: Date, Source Type, Sales in USD
 * (fallback Proceeds in USD) and, when present, App Apple Identifier.
 */
export function parsePurchasesReport(tsv: string, appId = ASKMED_APPLE_ID): Record<string, ChannelTotals> {
  const [header, ...lines] = tsv.replace(/^﻿/, "").trim().split(/\r?\n/);
  const columns = (header || "").split("\t").map(squash);
  const at = (...names: string[]) => {
    for (const name of names) {
      const index = columns.indexOf(squash(name));
      if (index >= 0) return index;
    }
    return -1;
  };
  const index = {
    date: at("Date"),
    source: at("Source Type"),
    amount: at("Sales in USD", "Proceeds in USD"),
    app: at("App Apple Identifier", "Apple Identifier", "App ID"),
  };
  if (index.date < 0 || index.source < 0 || index.amount < 0) {
    throw new Error("Unexpected App Store Purchases report columns");
  }
  const days: Record<string, ChannelTotals> = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split("\t");
    // The report request is AskMed-only; the app column is an extra guard.
    if (index.app >= 0 && cells[index.app]?.trim() && cells[index.app].trim() !== appId) continue;
    const date = reportDate(cells[index.date] || "");
    const amount = Number((cells[index.amount] || "").replace(/[$,\s]/g, ""));
    if (!date || !Number.isFinite(amount) || amount === 0) continue;
    const totals = (days[date] ??= emptyTotals());
    totals[sourceColumn(cells[index.source] || "")] += amount;
  }
  return days;
}

/** Meta's share of Meta + Organic sales that day; null when that is not positive. */
export function metaShareOf(day: ChannelTotals): number | null {
  const meta = day.app_referrer_usd + day.web_referrer_usd;
  const total = meta + day.app_store_search_usd + day.app_store_browse_usd;
  if (!(total > 0)) return null;
  return Math.min(1, Math.max(0, meta / total));
}

/**
 * Split each Vietnam day's AskMed revenue by that Apple day's Meta share.
 * Days without usable Apple data (usually the newest 1-2) use the trailing
 * 7 saved days' combined share and are marked estimated. Null when Apple has
 * no usable day at all, so the chart keeps AskMed as one segment.
 */
export function splitAskMedRevenue(
  points: { date: string; revenue: number }[],
  stored: ChannelDay[],
): Record<string, AskMedSplitDay> | null {
  const usable = stored.filter(day => metaShareOf(day) !== null).sort((a, b) => a.date.localeCompare(b.date));
  if (!usable.length) return null;
  const byDate = new Map(usable.map(day => [day.date, day]));
  const trailingShare = (date: string) => {
    const before = usable.filter(day => day.date < date);
    // Days before Apple's history (no AskMed sales yet) borrow its first week.
    const window = before.length ? before.slice(-ESTIMATE_DAYS) : usable.slice(0, ESTIMATE_DAYS);
    const sum = window.reduce((total, day) => {
      for (const column of SOURCE_COLUMNS) total[column] += day[column];
      return total;
    }, emptyTotals());
    return metaShareOf(sum) ?? 0;
  };
  return Object.fromEntries(points.map(point => {
    const own = byDate.get(point.date);
    const share = own ? metaShareOf(own)! : trailingShare(point.date);
    const meta = point.revenue * share;
    return [point.date, { meta, organic: point.revenue - meta, meta_share: share, estimated: !own }];
  }));
}

/** Saved Apple days on or after `from`. */
export async function readAskMedChannelDays(from: string): Promise<ChannelDay[]> {
  const { data, error } = await db.from("askmed_channel_daily")
    .select(["date", ...SOURCE_COLUMNS].join(",")).gte("date", from).order("date");
  if (error) throw new Error("Cannot read AskMed channel days");
  return ((data || []) as ChannelDay[]).map(row => ({
    ...row, ...Object.fromEntries(SOURCE_COLUMNS.map(column => [column, Number(row[column]) || 0])),
  }));
}

type Instance = { id: string; kind: string; processingDate: string | null };
type ApiList = { data?: { id: string; attributes?: Record<string, unknown> }[]; links?: { next?: string } };

async function ascGet(config: ReturnType<typeof salesConfig>, url: string): Promise<ApiList> {
  const response = await fetch(url.startsWith("http") ? url : `${ASC_API}${url}`, {
    headers: { Authorization: `Bearer ${salesToken(config)}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`App Store analytics request failed: HTTP ${response.status}`);
  return response.json() as Promise<ApiList>;
}

async function ascList(config: ReturnType<typeof salesConfig>, url: string) {
  const items: NonNullable<ApiList["data"]> = [];
  for (let next: string | undefined = url; next;) {
    const page: ApiList = await ascGet(config, next);
    items.push(...(page.data || []));
    next = page.links?.next;
  }
  return items;
}

/** Download every segment of one report instance and sum it by date. */
async function readInstance(config: ReturnType<typeof salesConfig>, instance: Instance) {
  const segments = await ascList(config, `/v1/analyticsReportInstances/${instance.id}/segments`);
  const days: Record<string, ChannelTotals> = {};
  for (const segment of segments) {
    const url = segment.attributes?.url;
    if (typeof url !== "string") continue;
    // Pre-signed download link: no App Store Connect token.
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`App Store analytics download failed: HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    const text = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body).toString("utf8") : body.toString("utf8");
    for (const [date, totals] of Object.entries(parsePurchasesReport(text))) {
      const sum = (days[date] ??= emptyTotals());
      for (const column of SOURCE_COLUMNS) sum[column] += totals[column];
    }
  }
  return { segments: segments.length, days };
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

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/**
 * Download report instances not read before (the one-time history once, then
 * ongoing daily files from the last 35 days) and save their dates. Apple's
 * official file replaces a saved day, including a website seed stand-in;
 * the latest Apple file wins.
 */
export async function syncAskMedChannels(now = new Date()) {
  const config = salesConfig();
  const since = addDays(now.toISOString().slice(0, 10), -ONGOING_WINDOW_DAYS);
  const savedInstances = await db.from("askmed_channel_instances").select("id");
  if (savedInstances.error) throw new Error("Cannot read saved AskMed channel data");
  const fetchedIds = new Set<string>((savedInstances.data || []).map((row: { id: string }) => row.id));

  const instances: Instance[] = [];
  const missingReports: string[] = [];
  for (const request of REPORT_REQUESTS) {
    const reports = (await ascList(config,
      `/v1/analyticsReportRequests/${request.id}/reports?filter[name]=${encodeURIComponent(REPORT_NAME)}`))
      .filter(report => squash(String(report.attributes?.name ?? REPORT_NAME)) === squash(REPORT_NAME));
    if (!reports.length) missingReports.push(request.kind);
    for (const report of reports) {
      // Only daily files: weekly/monthly rows would land on one date.
      const found = await ascList(config, `/v1/analyticsReports/${report.id}/instances?filter[granularity]=DAILY&limit=200`);
      for (const item of found) {
        const processingDate = typeof item.attributes?.processingDate === "string" ? item.attributes.processingDate.slice(0, 10) : null;
        if (fetchedIds.has(item.id)) continue;
        if (request.kind === "ONGOING" && processingDate && processingDate < since) continue;
        instances.push({ id: item.id, kind: request.kind, processingDate });
      }
    }
  }
  // History first, then by processing date, so newer files win within a run.
  instances.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "ONE_TIME_SNAPSHOT" ? -1 : 1)
    || (a.processingDate || "").localeCompare(b.processingDate || ""));
  const results = await mapLimit(instances, FETCH_CONCURRENCY, instance => readInstance(config, instance));

  const newDays = new Map<string, ChannelTotals>();
  results.forEach(result => {
    for (const [date, totals] of Object.entries(result.days)) newDays.set(date, totals);
  });
  const stamp = new Date().toISOString();
  if (newDays.size) {
    const { error } = await db.from("askmed_channel_daily").upsert(
      [...newDays].map(([date, totals]) => ({ date, ...totals, source: "analytics_report", updated_at: stamp })),
      { onConflict: "date" });
    if (error) throw new Error("Cannot save AskMed channel days");
  }
  // An instance without segments yet is read again next run.
  const done = instances.flatMap((instance, i) => results[i].segments ? [{
    id: instance.id, request_kind: instance.kind, processing_date: instance.processingDate,
    dates: Object.keys(results[i].days).sort(), fetched_at: stamp,
  }] : []);
  if (done.length) {
    const { error } = await db.from("askmed_channel_instances").upsert(done, { onConflict: "id" });
    if (error) throw new Error("Cannot save AskMed channel instances");
  }
  return {
    instances_read: done.length,
    instances_pending: instances.length - done.length,
    saved_dates: [...newDays.keys()].sort(),
    missing_reports: missingReports,
  };
}
