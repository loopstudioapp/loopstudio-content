import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * READ-ONLY Meta ad account change history (activity log) for the AskMed Ads chat
 * (owner, 2026-10-14: "DO NOT write into meta"; 2026-10-18: "cant u use api to figure what was the setting?").
 *
 * GET /api/meta/activities?account=act_1601374407428080&since=YYYY-MM-DD&until=YYYY-MM-DD
 * Needs `Authorization: Bearer $META_INSIGHTS_READ_KEY` (same key as /api/meta/insights and /api/meta/adsets).
 *
 * Returns every activity (budget, bid strategy, status, targeting edits...) in the range, all pages.
 * Only GET requests to the Graph API's /activities edge are made; nothing here can create, edit, pause or delete.
 */
const GRAPH = "https://graph.facebook.com/v21.0";
const ACCOUNT = "act_1601374407428080"; // AskMed's ad account only (owner, 2026-10-14)
const FIELDS = [
  "event_time", "event_type", "translated_event_type", "object_id", "object_name", "object_type",
  "extra_data", "actor_name",
];

type GraphBody = {
  data?: Record<string, unknown>[];
  paging?: { cursors?: { after?: string }; next?: string };
  error?: { message?: string };
};

export async function GET(request: NextRequest) {
  const key = process.env.META_INSIGHTS_READ_KEY;
  if (!key || request.headers.get("authorization") !== `Bearer ${key}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "Meta is not configured" }, { status: 500 });

  const p = request.nextUrl.searchParams;
  const account = p.get("account") || ACCOUNT;
  const since = p.get("since") || "";
  const until = p.get("until") || "";
  if (account !== ACCOUNT) return NextResponse.json({ error: "Only the AskMed ad account" }, { status: 400 });
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(since) || !day.test(until)) return NextResponse.json({ error: "Bad since/until" }, { status: 400 });

  const activities: Record<string, unknown>[] = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams({
      fields: FIELDS.join(","),
      since,
      until,
      limit: "500",
      access_token: token,
    });
    if (after) qs.set("after", after);
    const res = await fetch(`${GRAPH}/${ACCOUNT}/activities?${qs}`, { method: "GET" });
    const body = (await res.json().catch(() => ({}))) as GraphBody;
    if (!res.ok) {
      // Never echo the request URL: it carries the token.
      return NextResponse.json(
        { error: body?.error?.message || `Meta HTTP ${res.status}`, partial: activities.length },
        { status: 502 },
      );
    }
    activities.push(...(body.data || []));
    after = body.paging?.next ? body.paging?.cursors?.after : undefined;
    if (!after) break;
  }

  return NextResponse.json({ ok: true, account, since, until, count: activities.length, activities });
}
