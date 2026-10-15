import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * READ-ONLY Meta ad set settings for the AskMed Ads chat (owner, 2026-10-15: "use the api not chrome";
 * 2026-10-14: "DO NOT write into meta").
 *
 * GET /api/meta/adsets?campaign=<campaign id>
 * Needs `Authorization: Bearer $META_INSIGHTS_READ_KEY` (same key as /api/meta/insights).
 *
 * Returns each ad set's status, bid settings, targeting (locations, ages) and attached value rule set,
 * plus the rules inside each attached value rule set. Only GET requests to the Graph API are made
 * (the campaign's /adsets edge and the value rule set node); nothing here can create, edit, pause or delete.
 */
const GRAPH = "https://graph.facebook.com/v21.0";
const BASE_FIELDS = [
  "id", "name", "status", "effective_status", "updated_time", "bid_strategy", "bid_amount",
  "optimization_goal", "targeting", "learning_stage_info",
];
const VALUE_FIELDS = ["value_rule_set_id", "value_rules_applied"];

type GraphBody = { data?: Record<string, unknown>[]; error?: { message?: string } } & Record<string, unknown>;

async function graphGet(path: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { method: "GET" });
  const body = (await res.json().catch(() => ({}))) as GraphBody;
  return { ok: res.ok, status: res.status, body };
}

export async function GET(request: NextRequest) {
  const key = process.env.META_INSIGHTS_READ_KEY;
  if (!key || request.headers.get("authorization") !== `Bearer ${key}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = process.env.META_ACCESS_TOKEN;
  const campaign = request.nextUrl.searchParams.get("campaign") || "";
  if (!token) return NextResponse.json({ error: "Meta is not configured" }, { status: 500 });
  if (!/^\d{6,25}$/.test(campaign)) return NextResponse.json({ error: "Bad campaign" }, { status: 400 });

  // Try with the value rule fields first; if Meta rejects them, fall back to the base fields.
  let fieldsUsed = [...BASE_FIELDS, ...VALUE_FIELDS];
  let r = await graphGet(`${campaign}/adsets`, { fields: fieldsUsed.join(","), limit: "50" }, token);
  let valueFieldsError: string | null = null;
  if (!r.ok) {
    valueFieldsError = r.body?.error?.message || `Meta HTTP ${r.status}`;
    fieldsUsed = BASE_FIELDS;
    r = await graphGet(`${campaign}/adsets`, { fields: fieldsUsed.join(","), limit: "50" }, token);
  }
  if (!r.ok) {
    // Never echo the request URL: it carries the token.
    return NextResponse.json({ error: r.body?.error?.message || `Meta HTTP ${r.status}` }, { status: 502 });
  }
  const adsets = r.body.data || [];

  // Read each attached value rule set once.
  const ruleSetIds = [...new Set(adsets.map((a) => a.value_rule_set_id).filter((v): v is string => typeof v === "string"))];
  const ruleSets: Record<string, unknown> = {};
  for (const id of ruleSetIds) {
    if (!/^\d{6,25}$/.test(id)) continue;
    const rs = await graphGet(id, { fields: "name,rules{name,adjust_sign,adjust_value,status,criterias}" }, token);
    ruleSets[id] = rs.ok ? rs.body : { error: rs.body?.error?.message || `Meta HTTP ${rs.status}` };
  }

  return NextResponse.json({ ok: true, campaign, fieldsUsed, valueFieldsError, adsets, ruleSets });
}
