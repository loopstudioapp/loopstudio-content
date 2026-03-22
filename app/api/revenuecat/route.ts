import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let overviewCache: { data: unknown; timestamp: number } | null = null;

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

function planName(productId: string): string {
  if (!productId) return "—";
  if (productId.includes("weekly") || productId === "prod64a4d6b792") return "Weekly";
  if (productId.includes("yearly") || productId.includes("annual") || productId === "prodb2f4f71b2d") return "Yearly";
  if (productId.includes("monthly")) return "Monthly";
  return productId;
}

/* ── Overview Metrics ── */
async function fetchOverview(apiKey: string, projectId: string) {
  if (overviewCache && Date.now() - overviewCache.timestamp < CACHE_TTL) return overviewCache.data;

  // Get RevenueCat aggregate metrics for revenue/MRR
  const res = await fetch(`${RC_BASE}/projects/${projectId}/metrics/overview`, {
    headers: rcHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`RevenueCat API error ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const metricsArr: { id: string; value: number }[] = json.metrics || [];
  const m = Object.fromEntries(metricsArr.map((x) => [x.id, x.value]));

  // Get accurate trial/sub counts from DB
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
      .eq("auto_renewal", "will_renew")
      .eq("environment", "production"),
  ]);

  const data = {
    active_trials: trialsResult.count ?? 0,
    active_subs: subsResult.count ?? 0,
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

async function fetchSubscribers(filter: string) {
  const statusFilter = filter === "trial" ? "trialing" : "active";

  const { data, error } = await supabase
    .from("rc_subscriptions")
    .select("*")
    .eq("status", statusFilter)
    .eq("auto_renewal", "will_renew")
    .eq("environment", "production")
    .order("purchased_at", { ascending: true });

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  const subscribers: SubInfo[] = (data || []).map((row) => ({
    id: row.app_user_id || row.id,
    country: (row.country || "").toUpperCase(),
    app: row.store || "app_store",
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
