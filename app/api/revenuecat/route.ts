import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // allow up to 60s for iterating all customers

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let overviewCache: { data: unknown; timestamp: number } | null = null;
let subsCache: { data: unknown; filter: string; timestamp: number } | null = null;

const RC_BASE = "https://api.revenuecat.com/v2";

function getEnv() {
  const apiKey = process.env.REVENUECAT_API_KEY;
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  if (!apiKey || !projectId) return null;
  return { apiKey, projectId };
}

function rcHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

/* ── Overview Metrics ── */
async function fetchOverview(apiKey: string, projectId: string) {
  if (overviewCache && Date.now() - overviewCache.timestamp < CACHE_TTL) return overviewCache.data;

  // Get RevenueCat aggregate metrics for revenue/MRR
  const res = await fetch(`${RC_BASE}/projects/${projectId}/metrics/overview`, { headers: rcHeaders(apiKey) });
  if (!res.ok) throw new Error(`RevenueCat API error ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const metricsArr: { id: string; value: number }[] = json.metrics || [];
  const m = Object.fromEntries(metricsArr.map((x) => [x.id, x.value]));

  // Count non-cancelled trials and subs ourselves by iterating all customers
  let activeTrials = 0;
  let activeSubs = 0;
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`${RC_BASE}/projects/${projectId}/customers`);
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("starting_after", cursor);

    const custRes = await fetch(url.toString(), { headers: rcHeaders(apiKey) });
    if (!custRes.ok) break;

    const custJson = await custRes.json();
    const items = custJson.items || [];
    if (items.length === 0) break;

    const subResults = await Promise.all(
      items.map(async (c: { id: string }) => {
        const encoded = encodeURIComponent(c.id);
        const subRes = await fetch(
          `${RC_BASE}/projects/${projectId}/customers/${encoded}/subscriptions`,
          { headers: rcHeaders(apiKey) }
        );
        if (!subRes.ok) return [];
        const subJson = await subRes.json();
        return subJson.items || [];
      })
    );

    for (const subs of subResults) {
      for (const sub of subs) {
        const status = (sub.status || "").toLowerCase();
        const autoRenewal = (sub.auto_renewal_status || "").toLowerCase();
        const givesAccess = sub.gives_access === true;
        const env = (sub.environment || "").toLowerCase();
        if (env === "sandbox") continue; // skip test data
        if (status === "trialing" && autoRenewal === "will_renew" && givesAccess) activeTrials++;
        if (status === "active" && autoRenewal === "will_renew" && givesAccess) activeSubs++;
      }
    }

    cursor = items[items.length - 1]?.id;
    hasMore = !!custJson.next_page;
  }

  const data = {
    active_trials: activeTrials,
    active_subs: activeSubs,
    revenue_30d: m.revenue ?? 0,
    mrr: m.mrr ?? 0,
    new_customers: m.new_customers ?? 0,
    active_users: m.active_users ?? 0,
  };

  overviewCache = { data, timestamp: Date.now() };
  return data;
}

/* ── Subscribers List ── */
interface SubInfo {
  id: string;
  country: string;
  app: string;
  plan: string;
  purchase_date: string;
  expiry_date: string;
  revenue: number;
  auto_renewal: string;
  status: string;
}

function msToISO(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toISOString();
}

function planName(productId: string): string {
  // Map product IDs to human-readable names
  if (!productId) return "—";
  if (productId.includes("weekly") || productId === "prod64a4d6b792") return "Weekly";
  if (productId.includes("yearly") || productId.includes("annual") || productId === "prodb2f4f71b2d") return "Yearly";
  if (productId.includes("monthly")) return "Monthly";
  return productId;
}

async function fetchSubscribers(apiKey: string, projectId: string, filter: string) {
  // Check cache
  if (subsCache && subsCache.filter === filter && Date.now() - subsCache.timestamp < CACHE_TTL) {
    return subsCache.data;
  }

  const subscribers: SubInfo[] = [];
  let cursor: string | undefined;
  let totalChecked = 0;
  const MAX_CUSTOMERS = 200;

  try {
    while (totalChecked < MAX_CUSTOMERS) {
      const url = new URL(`${RC_BASE}/projects/${projectId}/customers`);
      url.searchParams.set("limit", "50");
      if (cursor) url.searchParams.set("starting_after", cursor);

      const res = await fetch(url.toString(), { headers: rcHeaders(apiKey) });

      if (res.status === 401 || res.status === 403) {
        return { error: "API key needs customer_information:customers:read permission", subscribers: [] };
      }
      if (!res.ok) throw new Error(`Customers API error ${res.status}`);

      const json = await res.json();
      const items = json.items || [];
      if (items.length === 0) break;

      // Check subscriptions in small batches to avoid rate limits
      const subResults: Record<string, unknown>[][] = [];
      for (let bi = 0; bi < items.length; bi += 5) {
        const batch = items.slice(bi, bi + 5);
        const batchResults = await Promise.all(
          batch.map(async (c: { id: string; last_seen_country?: string }) => {
            const encoded = encodeURIComponent(c.id);
            for (let attempt = 0; attempt < 3; attempt++) {
              const subRes = await fetch(
                `${RC_BASE}/projects/${projectId}/customers/${encoded}/subscriptions`,
                { headers: rcHeaders(apiKey) }
              );
              if (subRes.status === 429) {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                continue;
              }
              if (!subRes.ok) return [];
              const subJson = await subRes.json();
              return (subJson.items || []).map((s: Record<string, unknown>) => ({
                customerId: c.id,
                customerCountry: c.last_seen_country || "",
                ...s,
              }));
            }
            return [];
          })
        );
        subResults.push(...batchResults);
        if (bi + 5 < items.length) await new Promise(r => setTimeout(r, 200));
      }
      for (const subs of subResults) {
        for (const rawSub of subs) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sub = rawSub as any;
          const status = (sub.status || "").toLowerCase();
          const autoRenewal = (sub.auto_renewal_status || "").toLowerCase();
          const givesAccess = sub.gives_access === true;
          const env = (sub.environment || "").toLowerCase();
          if (env === "sandbox") continue; // skip test data

          // Filter logic
          let matches = false;
          if (filter === "trial") {
            matches = status === "trialing" && autoRenewal === "will_renew" && givesAccess;
          } else if (filter === "active") {
            matches = status === "active" && autoRenewal === "will_renew" && givesAccess;
          }

          if (matches) {
            const rev = sub.total_revenue_in_usd as { proceeds?: number; gross?: number } | undefined;
            subscribers.push({
              id: sub.customerId || "",
              country: (sub.country || sub.customerCountry || "").toUpperCase(),
              app: sub.store || "app_store",
              plan: planName(sub.product_id || ""),
              purchase_date: msToISO(sub.starts_at ?? null),
              expiry_date: msToISO(sub.current_period_ends_at ?? null),
              revenue: rev?.gross ?? rev?.proceeds ?? 0,
              auto_renewal: sub.auto_renewal_status || "",
              status: sub.status || "",
            });
          }
        }
      }

      totalChecked += items.length;
      cursor = items[items.length - 1]?.id;
      if (!json.next_page) break;
    }
  } catch (err) {
    if (err instanceof Error && (err.message.includes("401") || err.message.includes("403"))) {
      return { error: "API key needs customer_information:customers:read permission", subscribers: [] };
    }
    throw err;
  }

  const result = { subscribers, total: subscribers.length };
  subsCache = { data: result, filter, timestamp: Date.now() };
  return result;
}

export async function GET(request: NextRequest) {
  const env = getEnv();
  if (!env) {
    return NextResponse.json({ error: "REVENUECAT_API_KEY and REVENUECAT_PROJECT_ID must be set" }, { status: 500 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type");

  try {
    if (type === "overview") {
      const data = await fetchOverview(env.apiKey, env.projectId);
      return NextResponse.json(data);
    }

    if (type === "subscribers") {
      const filter = searchParams.get("filter") || "active";
      if (filter !== "trial" && filter !== "active") {
        return NextResponse.json({ error: "filter must be 'trial' or 'active'" }, { status: 400 });
      }
      const data = await fetchSubscribers(env.apiKey, env.projectId, filter);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "type must be 'overview' or 'subscribers'" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
