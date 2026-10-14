import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * READ-ONLY Meta ad insights for the AskMed Ads chat (owner, 2026-10-14: "DO NOT write into meta").
 *
 * GET /api/meta/insights?level=campaign|adset|ad&since=YYYY-MM-DD&until=YYYY-MM-DD
 *     [&breakdown=country|age|gender|publisher_platform|platform_position] [&daily=0] [&account=act_…]
 * Needs `Authorization: Bearer $META_INSIGHTS_READ_KEY` (its own key, separate from CRON_SECRET).
 *
 * Uses the existing server-side META_ACCESS_TOKEN (System User, ads_read). Only GET requests to the
 * Graph API `/insights` edge are made; nothing here can create, edit, pause or delete anything.
 */
const GRAPH = "https://graph.facebook.com/v21.0";
const FIELDS = [
  "date_start", "date_stop", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
  "spend", "impressions", "reach", "frequency", "cpm", "clicks", "ctr", "cpc", "inline_link_clicks",
  "inline_link_click_ctr", "actions", "action_values", "cost_per_action_type",
  "conversions", "conversion_values", "cost_per_conversion", "objective", "optimization_goal", "attribution_setting",
].join(",");
const LEVELS = new Set(["account", "campaign", "adset", "ad"]);
const BREAKDOWNS = new Set(["country", "age", "gender", "publisher_platform", "platform_position"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const key = process.env.META_INSIGHTS_READ_KEY;
  if (!key || request.headers.get("authorization") !== `Bearer ${key}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = process.env.META_ACCESS_TOKEN;
  const p = request.nextUrl.searchParams;
  const level = p.get("level") || "adset";
  const since = p.get("since") || "";
  const until = p.get("until") || "";
  const breakdown = p.get("breakdown");
  const rawAccount = (p.get("account") || process.env.META_AD_ACCOUNT_ID || "").trim();
  const account = rawAccount.startsWith("act_") ? rawAccount : `act_${rawAccount}`;
  if (!token || !/^act_\d+$/.test(account)) {
    return NextResponse.json({ error: "Meta is not configured" }, { status: 500 });
  }
  if (!LEVELS.has(level) || !DATE.test(since) || !DATE.test(until) || since > until) {
    return NextResponse.json({ error: "Bad level/since/until" }, { status: 400 });
  }
  if (breakdown && !BREAKDOWNS.has(breakdown)) {
    return NextResponse.json({ error: "Bad breakdown" }, { status: 400 });
  }

  const params = new URLSearchParams({
    level,
    fields: FIELDS,
    time_range: JSON.stringify({ since, until }),
    limit: "500",
    access_token: token,
  });
  if (p.get("daily") !== "0") params.set("time_increment", "1");
  if (breakdown) params.set("breakdowns", breakdown);

  const rows: unknown[] = [];
  let pages = 0;
  let url: string | null = `${GRAPH}/${account}/insights?${params}`;
  for (; url && pages < 60; pages++) {
    const res: Response = await fetch(url, { method: "GET" });
    const body = (await res.json().catch(() => ({}))) as { data?: unknown[]; paging?: { next?: string }; error?: { message?: string } };
    if (!res.ok) {
      // Never echo the request URL: it carries the token.
      return NextResponse.json({ error: body?.error?.message || `Meta HTTP ${res.status}` }, { status: 502 });
    }
    rows.push(...(body.data || []));
    const next: string | undefined = body.paging?.next;
    // Follow Meta's own "next" link only if it is still a GET on graph.facebook.com .../insights (any API version).
    url = next && /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/act_\d+\/insights\?/.test(next) ? next : null;
  }
  return NextResponse.json({ ok: true, account, level, since, until, breakdown: breakdown || null, pages, truncated: Boolean(url), rows });
}
