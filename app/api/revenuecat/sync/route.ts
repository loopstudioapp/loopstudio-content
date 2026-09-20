import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 300;

const RC_BASE = "https://api.revenuecat.com/v2";

const PROJECTS = [
  {
    name: "AskMed",
    apiKey: process.env.REVENUECAT_ASKMED_API_KEY || "",
    projectId: process.env.REVENUECAT_ASKMED_PROJECT_ID || "",
  },
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
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function syncProject(
  appName: string,
  apiKey: string,
  projectId: string
) {
  let cursor: string | undefined;
  let totalCustomers = 0;
  let totalSubs = 0;
  let errors = 0;
  const databaseErrors = new Set<string>();
  let hasMore = true;

  while (hasMore) {
    const url = new URL(
      `${RC_BASE}/projects/${projectId}/customers`
    );
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("starting_after", cursor);

    const res = await fetch(url.toString(), {
      headers: rcHeaders(apiKey),
    });
    if (!res.ok) throw new Error(`RevenueCat customer sync failed (HTTP ${res.status})`);

    const json = await res.json();
    const items: { id: string; last_seen_country?: string }[] =
      json.items || [];
    if (items.length === 0) break;

    for (let bi = 0; bi < items.length; bi += 5) {
      const batch = items.slice(bi, bi + 5);

      const batchResults = await Promise.all(
        batch.map(async (c) => {
          const encoded = encodeURIComponent(c.id);
          for (let attempt = 0; attempt < 3; attempt++) {
            const subRes = await fetch(
              `${RC_BASE}/projects/${projectId}/customers/${encoded}/subscriptions`,
              { headers: rcHeaders(apiKey) }
            );
            if (subRes.status === 429) {
              await new Promise((r) =>
                setTimeout(r, 1000 * (attempt + 1))
              );
              continue;
            }
            if (!subRes.ok) throw new Error(`RevenueCat subscription sync failed (HTTP ${subRes.status})`);
            const subJson = await subRes.json();
            return (subJson.items || []).map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (s: any) => ({
                customerId: c.id,
                customerCountry: c.last_seen_country || "",
                ...s,
              })
            );
          }
          throw new Error("RevenueCat subscription sync rate limited");
        })
      );

      for (const subs of batchResults) {
        for (const sub of subs) {
          const env = (sub.environment || "").toLowerCase();
          if (env === "sandbox") continue;

          const record = {
            id: appName === "AskMed" ? `AskMed:${sub.customerId}` : sub.customerId,
            app_user_id: sub.customerId,
            country:
              (sub.country || sub.customerCountry || "")
                .toUpperCase() || null,
            store: (sub.store || "app_store").toLowerCase(),
            product_id: sub.product_id || null,
            status: (sub.status || "").toLowerCase(),
            auto_renewal:
              (sub.auto_renewal_status || "").toLowerCase() || null,
            environment: env,
            purchased_at: sub.starts_at
              ? new Date(sub.starts_at).toISOString()
              : null,
            expires_at: sub.current_period_ends_at
              ? new Date(sub.current_period_ends_at).toISOString()
              : null,
            revenue_gross:
              sub.total_revenue_in_usd?.gross ??
              sub.total_revenue_in_usd?.proceeds ??
              0,
            app_name: appName,
            updated_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from("rc_subscriptions")
            .upsert(record, { onConflict: "id" });

          if (error) {
            errors++;
            databaseErrors.add(error.code || "unknown");
          } else {
            totalSubs++;
          }
        }
      }

      if (bi + 5 < items.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    totalCustomers += items.length;
    cursor = items[items.length - 1]?.id;
    hasMore = !!json.next_page;
  }

  return { appName, totalCustomers, totalSubs, errors, databaseErrors: Array.from(databaseErrors) };
}

export async function POST(request: NextRequest) {
  const appName = request.nextUrl.searchParams.get("app");
  if (appName && !PROJECTS.some((project) => project.name === appName)) {
    return NextResponse.json({ error: "app is not configured" }, { status: 400 });
  }
  if (appName === "AskMed" && (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized maintenance sync" }, { status: 401 });
  }
  const results = [];

  for (const project of PROJECTS) {
    // Keep legacy unfiltered sync behavior; AskMed imports are explicit.
    if (appName ? project.name !== appName : project.name === "AskMed") continue;
    if (!project.apiKey || !project.projectId) continue;

    try {
      const result = await syncProject(
        project.name,
        project.apiKey,
        project.projectId
      );
      results.push(result);
    } catch (err) {
      results.push({
        appName: project.name,
        error: err instanceof Error ? err.message : "Failed",
        totalCustomers: 0,
        totalSubs: 0,
        errors: 1,
      });
    }
  }

  const totalCustomers = results.reduce(
    (s, r) => s + (r.totalCustomers || 0), 0
  );
  const totalSubs = results.reduce(
    (s, r) => s + (r.totalSubs || 0), 0
  );
  const totalErrors = results.reduce(
    (s, r) => s + (r.errors || 0), 0
  );

  return NextResponse.json({
    ok: totalErrors === 0,
    customers_checked: totalCustomers,
    subscriptions_synced: totalSubs,
    errors: totalErrors,
    details: results,
  });
}
