import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RC_BASE = "https://api.revenuecat.com/v2";

const PROJECTS = [
  {
    name: "Roomy AI",
    apiKey: process.env.REVENUECAT_API_KEY || "",
    projectId: process.env.REVENUECAT_PROJECT_ID || "",
  },
  {
    name: "GrailScan",
    apiKey: process.env.REVENUECAT_GRAILSCAN_API_KEY || "",
    projectId: process.env.REVENUECAT_GRAILSCAN_PROJECT_ID || "",
  },
];

function rcHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

/**
 * Backfill rc_renewal_events for the last 30 days.
 *
 * Strategy: iterate active subs in our DB whose original purchase was
 * BEFORE today (so any recent activity = a renewal). For each, fetch
 * the live subscription from RevenueCat and check `current_period_starts_at`.
 * If that timestamp is within the last 30 days AND > the original `starts_at`,
 * record a renewal event for that day.
 *
 * Revenue estimate: total_revenue_in_usd.gross / number_of_periods.
 * Accurate enough for "today's renewals" view; webhook will write
 * exact values going forward.
 */
async function backfillProject(appName: string, apiKey: string, projectId: string) {
  if (!apiKey || !projectId) return { appName, checked: 0, written: 0, errors: 0 };

  // Cutoff: 30 days ago
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);

  // Pull subscriptions we already know about, that were purchased before today.
  // These are the candidates for "may have renewed in the last 30 days".
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: subs } = await supabase
    .from("rc_subscriptions")
    .select("app_user_id, country, product_id, store, revenue_gross, purchased_at")
    .eq("app_name", appName)
    .eq("environment", "production")
    .lt("purchased_at", thirtyDaysAgo.toISOString())
    // Active OR billing_retry — both states can have had renewals recently
    .in("status", ["active", "billing_retry"]);

  let checked = 0;
  let written = 0;
  let errors = 0;

  for (const row of subs || []) {
    checked++;
    const encoded = encodeURIComponent(row.app_user_id);

    let subData: { items?: Array<Record<string, unknown>> } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(
        `${RC_BASE}/projects/${projectId}/customers/${encoded}/subscriptions`,
        { headers: rcHeaders(apiKey) }
      );
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        errors++;
        break;
      }
      subData = await res.json();
      break;
    }
    if (!subData?.items) continue;

    for (const sub of subData.items) {
      const startsAt = sub.starts_at as string | undefined;
      const periodStartsAt = sub.current_period_starts_at as string | undefined;
      const env = ((sub.environment as string) || "").toLowerCase();
      if (env === "sandbox") continue;
      if (!startsAt || !periodStartsAt) continue;

      const startsMs = new Date(startsAt).getTime();
      const periodMs = new Date(periodStartsAt).getTime();
      // Not renewed yet, or original purchase is the current period
      if (periodMs <= startsMs) continue;
      // Only backfill last 30 days
      if (periodMs < thirtyDaysAgo.getTime()) continue;

      // Estimate per-period revenue
      const totalRev =
        (sub.total_revenue_in_usd as { gross?: number } | undefined)?.gross ?? 0;
      // Period in days ≈ (endsAt - startsAt) for a weekly = 7
      const periodEnds = sub.current_period_ends_at as string | undefined;
      let periodDays = 7;
      if (periodEnds && periodStartsAt) {
        const ms = new Date(periodEnds).getTime() - periodMs;
        if (ms > 0) periodDays = Math.max(1, Math.round(ms / 86400000));
      }
      const totalDays = Math.max(periodDays, Math.round((periodMs + periodDays * 86400000 - startsMs) / 86400000));
      const numPeriods = Math.max(1, Math.round(totalDays / periodDays));
      const perPeriod = numPeriods > 0 ? totalRev / numPeriods : 0;

      const productId = (sub.product_id as string) || row.product_id || "";
      const eventId = `backfill:${row.app_user_id}:${productId}:${periodStartsAt}`;

      const { error } = await supabase.from("rc_renewal_events").upsert(
        {
          id: eventId,
          app_user_id: row.app_user_id,
          app_name: appName,
          product_id: productId || null,
          country: row.country || null,
          store: (row.store || "app_store").toLowerCase(),
          revenue: perPeriod,
          occurred_at: new Date(periodStartsAt).toISOString(),
        },
        { onConflict: "id" }
      );

      if (error) errors++;
      else written++;
    }

    // Gentle pacing
    await new Promise((r) => setTimeout(r, 100));
  }

  return { appName, checked, written, errors };
}

export async function GET() {
  const results = [];
  for (const p of PROJECTS) {
    try {
      results.push(await backfillProject(p.name, p.apiKey, p.projectId));
    } catch (e) {
      results.push({
        appName: p.name,
        error: e instanceof Error ? e.message : "Failed",
        checked: 0,
        written: 0,
        errors: 1,
      });
    }
  }
  return NextResponse.json({ ok: true, results });
}

export async function POST() {
  return GET();
}
