import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let overviewCache: { data: unknown; timestamp: number } | null = null;

const RC_BASE = "https://api.revenuecat.com/v2";

// Multiple RevenueCat projects
const RC_PROJECTS = [
  {
    name: "Roomy AI",
    apiKey: process.env.REVENUECAT_API_KEY || "",
    projectId: process.env.REVENUECAT_PROJECT_ID || "",
  },
  {
    name: "SwipeAway",
    apiKey: process.env.REVENUECAT_SWIPEAWAY_API_KEY || "",
    projectId: process.env.REVENUECAT_SWIPEAWAY_PROJECT_ID || "",
  },
];

function getEnv() {
  const apiKey = process.env.REVENUECAT_API_KEY;
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  if (!apiKey || !projectId) return null;
  return { apiKey, projectId };
}

function rcHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function planName(productId: string): string {
  if (!productId) return "—";
  if (productId.includes("weekly") || productId === "prodb2f4f71b2d") return "Weekly";
  if (productId.includes("yearly") || productId.includes("annual") || productId === "prod64a4d6b792") return "Yearly";
  if (productId.includes("monthly")) return "Monthly";
  return productId;
}

/* ── Overview Metrics (combines all projects) ── */
async function fetchOverview(apiKey: string, projectId: string) {
  if (overviewCache && Date.now() - overviewCache.timestamp < CACHE_TTL) return overviewCache.data;

  // Fetch metrics from ALL projects in parallel
  const projectResults = await Promise.all(
    RC_PROJECTS
      .filter((p) => p.apiKey && p.projectId)
      .map(async (project) => {
        try {
          const res = await fetch(
            `${RC_BASE}/projects/${project.projectId}/metrics/overview`,
            { headers: rcHeaders(project.apiKey) }
          );
          if (!res.ok) return { name: project.name, metrics: {} as Record<string, number> };
          const json = await res.json();
          const arr: { id: string; value: number }[] = json.metrics || [];
          return {
            name: project.name,
            metrics: Object.fromEntries(arr.map((x) => [x.id, x.value])),
          };
        } catch {
          return { name: project.name, metrics: {} as Record<string, number> };
        }
      })
  );

  // Sum up all projects
  let totalRevenue = 0;
  let totalMrr = 0;
  let totalNewCustomers = 0;
  let totalActiveUsers = 0;
  const perApp: { name: string; revenue: number; mrr: number; subs: number; trials: number }[] = [];

  for (const p of projectResults) {
    const rev = p.metrics.revenue ?? 0;
    const mrr = p.metrics.mrr ?? 0;
    totalRevenue += rev;
    totalMrr += mrr;
    totalNewCustomers += p.metrics.new_customers ?? 0;
    totalActiveUsers += p.metrics.active_users ?? 0;
    perApp.push({
      name: p.name,
      revenue: rev,
      mrr: mrr,
      subs: p.metrics.active_subscriptions ?? 0,
      trials: p.metrics.active_trials ?? 0,
    });
  }

  // Get accurate Roomy AI trial/sub counts from DB
  const [trialsResult, subsResult] = await Promise.all([
    supabase
      .from("rc_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "trialing")
      .eq("auto_renewal", "will_renew")
      .eq("environment", "production"),
    supabase
      .from("rc_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .eq("environment", "production")
      .gt("revenue_gross", 0),
  ]);

  // Override Roomy AI counts with DB values
  const roomyApp = perApp.find((p) => p.name === "Roomy AI");
  if (roomyApp) {
    roomyApp.trials = trialsResult.count ?? 0;
    roomyApp.subs = subsResult.count ?? 0;
  }

  const totalTrials = perApp.reduce((s, p) => s + p.trials, 0);
  const totalSubs = perApp.reduce((s, p) => s + p.subs, 0);

  const data = {
    active_trials: totalTrials,
    active_subs: totalSubs,
    revenue_30d: totalRevenue,
    mrr: totalMrr,
    new_customers: totalNewCustomers,
    active_users: totalActiveUsers,
    per_app: perApp,
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

async function fetchSubscribers(filter: string) {
  const statusFilter = filter === "trial" ? "trialing" : "active";

  // All apps from DB (Roomy AI + SwipeAway)
  let query = supabase
    .from("rc_subscriptions")
    .select("*")
    .eq("status", statusFilter)
    .eq("environment", "production");

  if (filter === "trial") {
    query = query.eq("auto_renewal", "will_renew");
  } else {
    query = query.gt("revenue_gross", 0);
  }

  const { data, error } = await query
    .order("purchased_at", { ascending: true });
  if (error) throw new Error(`Database error: ${error.message}`);

  const subscribers: SubInfo[] = (data || []).map((row) => ({
    id: row.app_user_id || row.id,
    country: (row.country || "").toUpperCase(),
    app: row.app_name || "Roomy AI",
    plan: planName(row.product_id || ""),
    purchase_date: row.purchased_at || "",
    expiry_date: row.expires_at || "",
    revenue: row.revenue_gross || 0,
    auto_renewal: row.auto_renewal || "",
    status: row.status || "",
  }));

  return { subscribers, total: subscribers.length };
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
        return NextResponse.json({ error: "filter must be 'trial' or 'active'" }, { status: 400 });
      }
      const data = await fetchSubscribers(filter);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "type must be 'overview' or 'subscribers'" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
