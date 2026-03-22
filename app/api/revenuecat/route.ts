import { NextRequest, NextResponse } from "next/server";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let overviewCache: { data: unknown; timestamp: number } | null = null;

interface RevenueCatCustomer {
  id: string;
  attributes?: Record<string, { value: string }>;
}

interface RevenueCatSubscription {
  id: string;
  status: string;
  country?: string;
  product_id?: string;
  store?: string;
  purchase_date?: string;
  expiration_date?: string;
  revenue?: number;
  total_revenue_in_usd?: { amount: number };
}

function getEnv() {
  const apiKey = process.env.REVENUECAT_API_KEY;
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  if (!apiKey || !projectId) {
    return null;
  }
  return { apiKey, projectId };
}

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function fetchOverview(apiKey: string, projectId: string) {
  if (overviewCache && Date.now() - overviewCache.timestamp < CACHE_TTL) {
    return overviewCache.data;
  }

  const res = await fetch(
    `https://api.revenuecat.com/v2/projects/${projectId}/metrics/overview`,
    { headers: headers(apiKey) }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RevenueCat API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  const metricsArr: { id: string; value: number }[] = json.metrics || [];
  const m = Object.fromEntries(metricsArr.map((x) => [x.id, x.value]));

  const data = {
    active_trials: m.active_trials ?? 0,
    active_subs: m.active_subscriptions ?? 0,
    revenue_30d: m.revenue ?? 0,
    mrr: m.mrr ?? 0,
    new_customers: m.new_customers ?? 0,
    active_users: m.active_users ?? 0,
  };

  overviewCache = { data, timestamp: Date.now() };
  return data;
}

async function fetchSubscribers(
  apiKey: string,
  projectId: string,
  filter: string
) {
  const subscribers: {
    id: string;
    country: string;
    app: string;
    plan: string;
    purchase_date: string;
    expiry_date: string;
    revenue: number;
  }[] = [];

  let startingAfter: string | undefined;
  let fetched = 0;
  const limit = 100;

  try {
    while (fetched < limit) {
      const url = new URL(
        `https://api.revenuecat.com/v2/projects/${projectId}/customers`
      );
      url.searchParams.set("limit", String(Math.min(20, limit - fetched)));
      if (startingAfter) {
        url.searchParams.set("starting_after", startingAfter);
      }

      const res = await fetch(url.toString(), { headers: headers(apiKey) });

      if (res.status === 401 || res.status === 403) {
        return {
          error:
            "API key needs customer_information:customers:read permission",
          subscribers: [],
        };
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`RevenueCat customers API error ${res.status}: ${text}`);
      }

      const json = await res.json();
      const items: RevenueCatCustomer[] = json.items || json.customers || [];

      if (items.length === 0) break;

      for (const customer of items) {
        const subRes = await fetch(
          `https://api.revenuecat.com/v2/projects/${projectId}/customers/${customer.id}/subscriptions`,
          { headers: headers(apiKey) }
        );

        if (subRes.status === 401 || subRes.status === 403) {
          return {
            error:
              "API key needs customer_information:customers:read permission",
            subscribers: [],
          };
        }

        if (!subRes.ok) continue;

        const subJson = await subRes.json();
        const subs: RevenueCatSubscription[] =
          subJson.items || subJson.subscriptions || [];

        for (const sub of subs) {
          const status = (sub.status || "").toLowerCase();
          const matchesTrial = filter === "trial" && status === "trial";
          const matchesActive =
            filter === "active" && (status === "active" || status === "in_trial");

          if (matchesTrial || matchesActive) {
            subscribers.push({
              id: customer.id,
              country: sub.country || "",
              app: sub.store || "",
              plan: sub.product_id || "",
              purchase_date: sub.purchase_date || "",
              expiry_date: sub.expiration_date || "",
              revenue: sub.total_revenue_in_usd?.amount ?? sub.revenue ?? 0,
            });
          }
        }

        fetched++;
        if (fetched >= limit) break;
      }

      const nextCursor =
        json.next_page_url || json.next_page || json.has_more;
      if (!nextCursor || items.length === 0) break;

      startingAfter = items[items.length - 1].id;
    }
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("401") || err.message.includes("403"))
    ) {
      return {
        error:
          "API key needs customer_information:customers:read permission",
        subscribers: [],
      };
    }
    throw err;
  }

  return { subscribers };
}

export async function GET(request: NextRequest) {
  const env = getEnv();
  if (!env) {
    return NextResponse.json(
      { error: "REVENUECAT_API_KEY and REVENUECAT_PROJECT_ID must be set" },
      { status: 500 }
    );
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
        return NextResponse.json(
          { error: "filter must be 'trial' or 'active'" },
          { status: 400 }
        );
      }
      const data = await fetchSubscribers(env.apiKey, env.projectId, filter);
      return NextResponse.json(data);
    }

    return NextResponse.json(
      { error: "type must be 'overview' or 'subscribers'" },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
