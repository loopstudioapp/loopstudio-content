import { db } from "@/lib/db";
import type { DailyPoint } from "@/app/api/revenuecat/route";
import type { OwnerApp } from "@/lib/revenuecat/owner";

// Permanent owner history (Loop 2026-11-13: "change so that server keep profit and all data
// forever not 30 days"). The owner page rebuilds only a rolling 30-day window, so every day it
// shows is saved here, one row per Vietnam day, and kept forever. Days before the first save are
// backfilled from the same sources (RevenueCat, Apple sales reports, Meta, saved OpenRouter costs).
//
// Unlike the page's chart, refunds here are the real refunds of that day (net of reversals), not
// the 30-day average, so any date range adds up to exactly what happened. Over the page's own
// 30 days both give the same total.

export const HISTORY_PREFIX = "__owner_day__";
export const HISTORY_START = "2026-01-01";
const historyId = (date: string) => `${HISTORY_PREFIX}:${date}`;

export const HISTORY_PARTS = ["grailscan", "ios", "android"] as const;
export type HistoryPartName = (typeof HISTORY_PARTS)[number];
export type HistoryPart = {
  revenue: number; refunds: number; store_cut: number; meta: number; revenuecat: number;
  openrouter: number; ai_ads: number; profit: number; new_subs: number;
};
export type HistoryDay = Record<HistoryPartName | "total", HistoryPart> & {
  date: string;
  /** live = saved from the owner page's own numbers; backfill = rebuilt from the sources later. */
  source: "live" | "backfill";
  /** Today: still changing until the day is over. */
  partial: boolean;
  /** Fields that are not the exact bill for this day (e.g. OpenRouter before its daily records). */
  estimated?: string[];
  saved_at: string;
};

export type HistoryInput = {
  dates: string[];
  today?: string;
  grail: Record<string, DailyPoint | undefined>;
  askmed: Record<string, DailyPoint | undefined>;
  /** Whole ad account spend in USD including Meta's 10% VAT. */
  metaWithVat: Record<string, number>;
  /** Spend per platform in any currency (only the ratio is used). */
  metaSplit: Record<string, { ios: number; android: number } | undefined>;
  openrouter: Record<string, number>;
  aiAds: Record<string, number>;
  appleKept: (app: OwnerApp, date: string) => number;
  googleKept: (date: string) => number;
  revenuecatRate: (date: string) => number;
  source: HistoryDay["source"];
  estimated?: Record<string, string[]>;
};

const emptyPart = (): HistoryPart => ({
  revenue: 0, refunds: 0, store_cut: 0, meta: 0, revenuecat: 0, openrouter: 0, ai_ads: 0, profit: 0, new_subs: 0,
});
const FIELDS = Object.keys(emptyPart()) as (keyof HistoryPart)[];
const round = (value: number) => Math.round((Number(value) || 0) * 10000) / 10000;
const roundPart = (part: HistoryPart): HistoryPart =>
  Object.fromEntries(FIELDS.map(field => [field, round(part[field])])) as HistoryPart;
const netRefunds = (amount?: number, reversed?: number) => (amount || 0) - (reversed || 0);

/** Same split as the owner page (combineOwnerStats), with each day's real refunds. */
export function buildHistoryDays(input: HistoryInput): HistoryDay[] {
  const savedAt = new Date().toISOString();
  return input.dates.map(date => {
    const g = input.grail[date];
    const a = input.askmed[date];
    const grailscan = emptyPart(), ios = emptyPart(), android = emptyPart();
    grailscan.revenue = g?.revenue || 0;
    grailscan.refunds = netRefunds(g?.refund_source_amount, g?.refund_source_reversed_amount);
    grailscan.new_subs = g?.new_subs || 0;
    const known = Boolean(a?.android);
    if (known) {
      android.revenue = a!.android!.revenue;
      android.refunds = netRefunds(a!.android!.refund_source_amount, a!.android!.refund_source_reversed_amount);
      android.new_subs = a!.android!.new_subs;
    }
    ios.revenue = (a?.revenue || 0) - android.revenue;
    ios.refunds = netRefunds(a?.refund_source_amount, a?.refund_source_reversed_amount) - android.refunds;
    ios.new_subs = Math.max(0, (a?.new_subs || 0) - android.new_subs);
    const net = (part: HistoryPart) => part.revenue - part.refunds;
    grailscan.store_cut = net(grailscan) * (1 - input.appleKept("GrailScan", date));
    ios.store_cut = net(ios) * (1 - input.appleKept("AskMed", date));
    android.store_cut = net(android) * (1 - input.googleKept(date));
    // Meta: ASKMED ANDROID campaigns are Android, every other campaign is iOS; GrailScan has
    // no spend in this ad account. A day without Play numbers keeps all spend with iOS.
    const meta = input.metaWithVat[date] || 0;
    const split = input.metaSplit[date];
    const splitTotal = (split?.ios || 0) + (split?.android || 0);
    const androidShare = known && splitTotal > 0 ? (split!.android || 0) / splitTotal : 0;
    android.meta = meta * androidShare;
    ios.meta = meta - android.meta;
    const aiAds = input.aiAds[date] || 0;
    android.ai_ads = aiAds * androidShare;
    ios.ai_ads = aiAds - android.ai_ads;
    const openrouter = input.openrouter[date] || 0;
    const gross = grailscan.revenue + ios.revenue + android.revenue;
    const rcRate = input.revenuecatRate(date);
    for (const part of [grailscan, ios, android]) {
      part.openrouter = gross > 0 ? openrouter * (part.revenue / gross) : 0;
      part.revenuecat = rcRate ? net(part) * rcRate : 0;
    }
    if (gross <= 0) ios.openrouter = openrouter;
    for (const part of [grailscan, ios, android]) {
      part.profit = net(part) - part.store_cut - part.meta - part.revenuecat - part.openrouter - part.ai_ads;
    }
    const total = emptyPart();
    for (const part of [grailscan, ios, android]) for (const field of FIELDS) total[field] += part[field];
    const estimated = input.estimated?.[date];
    return {
      date,
      grailscan: roundPart(grailscan), ios: roundPart(ios), android: roundPart(android), total: roundPart(total),
      source: input.source,
      partial: date === input.today,
      ...(estimated?.length ? { estimated } : {}),
      saved_at: savedAt,
    };
  });
}

const sameNumbers = (a: HistoryDay, b: HistoryDay) =>
  a.partial === b.partial && a.source === b.source && JSON.stringify(a.estimated || []) === JSON.stringify(b.estimated || [])
  && [...HISTORY_PARTS, "total" as const].every(name => FIELDS.every(field => a[name][field] === b[name][field]));

/**
 * Save days, writing only rows whose numbers changed. Backfilled days never replace a day the
 * owner page saved itself; the page's own days always replace older values.
 */
export async function saveHistoryDays(days: HistoryDay[]): Promise<{ written: number; kept_live: number }> {
  if (!days.length) return { written: 0, kept_live: 0 };
  const existing = await readHistoryById(days.map(day => historyId(day.date)));
  let keptLive = 0;
  const rows = days.flatMap(day => {
    const saved = existing.get(day.date);
    if (saved && day.source === "backfill" && saved.source === "live") { keptLive += 1; return []; }
    if (saved && sameNumbers(saved, day)) return [];
    return [{
      id: historyId(day.date), category: "system", title_template: "Owner daily history",
      description_template: JSON.stringify(day), prompt_seed: day.saved_at, times_used: 0,
    }];
  });
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await db.from("pinterest_topics").upsert(rows.slice(i, i + 50), { onConflict: "id" });
    if (error) throw new Error(`Owner history save failed: ${error.message}`);
  }
  return { written: rows.length, kept_live: keptLive };
}

async function readHistoryById(ids: string[]): Promise<Map<string, HistoryDay>> {
  const out = new Map<string, HistoryDay>();
  for (let i = 0; i < ids.length; i += 90) {
    const { data, error } = await db.from("pinterest_topics").select("description_template").in("id", ids.slice(i, i + 90));
    if (error) throw new Error(`Owner history read failed: ${error.message}`);
    for (const row of data || []) {
      const day = JSON.parse(row.description_template) as HistoryDay;
      out.set(day.date, day);
    }
  }
  return out;
}

/** Saved days from..to (inclusive, Vietnam dates), oldest first. */
export async function readHistory(from: string, to: string): Promise<HistoryDay[]> {
  const { data, error } = await db.from("pinterest_topics").select("description_template")
    .gte("id", historyId(from)).lte("id", historyId(to)).order("id", { ascending: true });
  if (error) throw new Error(`Owner history read failed: ${error.message}`);
  return (data || []).map(row => JSON.parse(row.description_template) as HistoryDay);
}

/** Vietnam 2026 personal business tax: one flat rate on the year's profit, by year-to-date revenue. */
export function autoTaxRate(ytdVnd: number): number {
  if (ytdVnd <= 500_000_000) return 0;
  if (ytdVnd <= 3_000_000_000) return 0.15;
  if (ytdVnd <= 50_000_000_000) return 0.17;
  return 0.2;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) out.push(date);
  return out;
}

export type HistorySummary = {
  from: string;
  to: string;
  days_saved: number;
  missing_dates: string[];
  partial_dates: string[];
  estimated: Record<string, string[]>;
  totals: Record<HistoryPartName | "total", HistoryPart>;
};

export function summarizeHistory(days: HistoryDay[], from: string, to: string): HistorySummary {
  const totals = Object.fromEntries([...HISTORY_PARTS, "total"].map(name => [name, emptyPart()])) as HistorySummary["totals"];
  const saved = new Set<string>();
  const estimated: Record<string, string[]> = {};
  for (const day of days) {
    if (day.date < from || day.date > to) continue;
    saved.add(day.date);
    for (const name of [...HISTORY_PARTS, "total" as const]) for (const field of FIELDS) totals[name][field] += day[name][field] || 0;
    for (const field of day.estimated || []) (estimated[field] ||= []).push(day.date);
  }
  for (const name of Object.keys(totals) as (keyof typeof totals)[]) {
    totals[name] = Object.fromEntries(FIELDS.map(field => [field, Math.round(totals[name][field] * 100) / 100])) as HistoryPart;
  }
  return {
    from, to,
    days_saved: saved.size,
    missing_dates: datesBetween(from, to).filter(date => !saved.has(date)),
    partial_dates: days.filter(day => day.partial && saved.has(day.date)).map(day => day.date),
    estimated,
    totals,
  };
}
