import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAppleProceeds } from "@/lib/appstore/proceeds";
import { autoTaxRate, HISTORY_START, readHistory, summarizeHistory } from "@/lib/owner/history";

// Saved owner numbers for any date range (Loop 2026-11-13: revenue, cost, profit and tax questions
// are answered only from the server's saved figures). Read-only: it never recomputes or calls
// RevenueCat, Apple, Google or Meta.
//
//   GET /api/owner/history                      year to date (Jan 1 → today, Vietnam dates)
//   GET /api/owner/history?from=2026-01-01&to=2026-06-30
//   add &days=1 to include every saved day
//
// Totals per part (grailscan, ios, android) and all together: revenue (gross), refunds (real
// refunds of those days), store_cut (Apple / Google), meta (incl. 10% VAT), revenuecat,
// openrouter, ai_ads, profit (before personal tax), new_subs. Tax is the owner page's Auto
// Vietnam personal tax: one flat rate on the period's profit, picked by Apple's year-to-date
// proceeds across every app.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const to = searchParams.get("to") || vnToday();
  const from = searchParams.get("from") || `${to.slice(0, 4)}-01-01`;
  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD with from <= to" }, { status: 400 });
  }
  try {
    const [days, proceeds, backfill] = await Promise.all([
      readHistory(from, to),
      getAppleProceeds(),
      db.from("pinterest_topics").select("description_template").eq("id", "__owner_history_backfill__").maybeSingle(),
    ]);
    const summary = summarizeHistory(days, from, to);
    const profit = summary.totals.total.profit;
    // The tax rate is set per calendar year; only the year Apple's YTD proceeds cover is known.
    const sameYear = from.slice(0, 4) === to.slice(0, 4) && Number(from.slice(0, 4)) === proceeds.ytd_year;
    const rate = sameYear && proceeds.source !== "default" ? autoTaxRate(proceeds.ytd_proceeds_vnd) : null;
    const tax = rate === null ? null : Math.round(Math.max(0, profit) * rate * 100) / 100;
    const usdVnd = proceeds.usd_vnd || null;
    const vnd = (usd: number | null) => (usd === null || !usdVnd ? null : Math.round(usd * usdVnd));
    const state = backfill.data?.description_template ? JSON.parse(backfill.data.description_template) : null;
    return NextResponse.json({
      ...summary,
      history_starts: HISTORY_START,
      tax: {
        mode: "auto",
        rate,
        basis: "Vietnam personal tax on the period's profit, rate from Apple's year-to-date proceeds (all apps)",
        ytd_apple_proceeds_vnd: rate === null ? null : Math.round(proceeds.ytd_proceeds_vnd),
        ytd_through: proceeds.ytd_through,
        tax_usd: tax,
        profit_after_tax_usd: tax === null ? null : Math.round((profit - tax) * 100) / 100,
      },
      vnd: {
        usd_vnd: usdVnd,
        revenue: vnd(summary.totals.total.revenue),
        profit: vnd(profit),
        tax: vnd(tax),
        profit_after_tax: tax === null ? null : vnd(profit - tax),
      },
      backfill: state ? {
        done: Boolean(state.finished_at), start: state.start, end: state.end,
        months_done: state.done, last_error: state.last_error || null, finished_at: state.finished_at || null,
      } : null,
      ...(searchParams.get("days") === "1" ? { days: days.filter(day => day.date >= from && day.date <= to) } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Owner history unavailable" }, { status: 500 });
  }
}
