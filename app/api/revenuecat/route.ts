import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getTodayMetaSpend, getMetaSpendByDay, type MetaSpend } from "@/lib/meta/ads";

export const maxDuration = 60;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let overviewCache: { data: unknown; timestamp: number } | null = null;

const RC_BASE = "https://api.revenuecat.com/v2";

// Multiple RevenueCat projects. SwipeAway intentionally omitted —
// it's hidden from the owner dashboard. Webhook still receives it but
// it won't appear here.
const RC_PROJECTS = [
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

// Apps that should appear on the dashboard. SwipeAway data stays in DB
// but never reaches the UI.
const VISIBLE_APPS = new Set(["Roomy AI", "GrailScan"]);

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
  if (productId.includes("weekly") || productId === "prodb2f4f71b2d" || productId === "prod6b651edf9a") return "Weekly";
  if (productId.includes("yearly") || productId.includes("annual") || productId === "prod64a4d6b792" || productId === "prodf03355abc6") return "Yearly";
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

  const subscribers: SubInfo[] = (data || [])
    .filter((row) => VISIBLE_APPS.has(row.app_name || "Roomy AI"))
    .map((row) => ({
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

/* ── Today's stats (per app: today_revenue, new_revenue, new_subs, mrr) + today transactions ── */
type TodayTxn = {
  id: string;
  country: string;
  app: string;
  plan: string;
  product_id: string;
  store: string;
  occurred_at: string;
  expires_at: string;
  revenue: number;
  type: "NEW_SUB" | "RENEWAL";
};
type TodayPerApp = {
  today_revenue: number;
  new_revenue: number;
  new_subs: number;
  mrr: number;
};

const VN_TZ = "Asia/Ho_Chi_Minh";
function vnDateIso(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}
function vnDayBoundsUtc(): { startUtc: string; endUtc: string } {
  const today = vnDateIso();
  const startUtc = new Date(`${today}T00:00:00+07:00`).toISOString();
  const endUtc = new Date(`${today}T23:59:59.999+07:00`).toISOString();
  return { startUtc, endUtc };
}

export type DailyPoint = { date: string; revenue: number; profit: number };

/**
 * Last 30 days of daily GROSS revenue (from RevenueCat revenue chart, both
 * apps summed) and daily profit (net revenue − VAT-inclusive ad spend).
 */
async function fetchDaily30d(appleRate: number, metaVat: number): Promise<DailyPoint[]> {
  // RevenueCat's chart is the authoritative complete revenue source for the
  // 30-day total. DB event rows are used only as timing hints/corrections.
  const today = vnDateIso();
  const start = vnDateIso(new Date(Date.now() - 29 * 86400 * 1000));
  const rcStart = new Date(Date.now() - 31 * 86400 * 1000).toISOString().slice(0, 10);
  const rcEnd = new Date().toISOString().slice(0, 10);

  const dates: string[] = [];
  for (let i = 29; i >= 0; i--) {
    dates.push(vnDateIso(new Date(Date.now() - i * 86400 * 1000)));
  }
  const addDay = (dateStr: string, n: number) =>
    new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + n * 86400 * 1000)
      .toISOString()
      .slice(0, 10);

  const [rcResults, subsResult, renewalsResult, spendUsdByDate] = await Promise.all([
    Promise.all(
      RC_PROJECTS.filter((p) => p.apiKey && p.projectId).map(async (project) => {
        try {
          const res = await fetch(
            `${RC_BASE}/projects/${project.projectId}/charts/revenue?resolution=day&start_date=${rcStart}&end_date=${rcEnd}`,
            { headers: rcHeaders(project.apiKey) }
          );
          if (!res.ok) return [] as { cohort: number; value: number; measure: number }[];
          const json = await res.json();
          return (json?.values || []) as { cohort: number; value: number; measure: number }[];
        } catch {
          return [] as { cohort: number; value: number; measure: number }[];
        }
      })
    ),
    supabase
      .from("rc_subscriptions")
      .select("app_user_id, app_name, purchased_at, revenue_gross")
      .eq("environment", "production"),
    supabase
      .from("rc_renewal_events")
      .select("app_user_id, app_name, occurred_at, revenue")
      .gte("occurred_at", `${rcStart}T00:00:00Z`)
      .lt("occurred_at", `${addDay(rcEnd, 1)}T00:00:00Z`),
    getMetaSpendByDay(start, today),
  ]);

  const rcByUtc: Record<string, number> = {};
  for (const values of rcResults) {
    for (const v of values) {
      if (v.measure !== 0) continue;
      const utcDate = new Date(v.cohort * 1000).toISOString().slice(0, 10);
      rcByUtc[utcDate] = (rcByUtc[utcDate] || 0) + (v.value || 0);
    }
  }

  const early: Record<string, number> = {};
  const late: Record<string, number> = {};
  const sameUtcDayRenewalKeys = new Set<string>();
  const utcDateOf = (iso: string) => new Date(iso).toISOString().slice(0, 10);
  const addSplitWeight = (iso: string | null | undefined, rawAmount: number | null | undefined) => {
    if (!iso) return;
    const dt = new Date(iso);
    if (!Number.isFinite(dt.getTime())) return;
    const utcDate = dt.toISOString().slice(0, 10);
    const amount = rawAmount && rawAmount > 0 ? rawAmount : 1;
    if (dt.getUTCHours() < 17) early[utcDate] = (early[utcDate] || 0) + amount;
    else late[utcDate] = (late[utcDate] || 0) + amount;
  };

  for (const r of renewalsResult.data || []) {
    const app = r.app_name || "Roomy AI";
    if (!VISIBLE_APPS.has(app)) continue;
    if (!r.occurred_at) continue;
    sameUtcDayRenewalKeys.add(`${app}:${r.app_user_id}:${utcDateOf(r.occurred_at)}`);
    addSplitWeight(r.occurred_at, r.revenue || 0);
  }

  for (const s of subsResult.data || []) {
    if (!VISIBLE_APPS.has(s.app_name || "Roomy AI")) continue;
    if (!s.purchased_at) continue;
    const app = s.app_name || "Roomy AI";
    const key = `${app}:${s.app_user_id}:${utcDateOf(s.purchased_at)}`;
    if (sameUtcDayRenewalKeys.has(key)) continue;
    addSplitWeight(s.purchased_at, s.revenue_gross || 0);
  }
  const earlyFrac = (utcDate: string): number => {
    const e = early[utcDate] || 0;
    const l = late[utcDate] || 0;
    return e + l > 0 ? e / (e + l) : 17 / 24;
  };

  const revByVnDate: Record<string, number> = {};
  for (const [utcDate, total] of Object.entries(rcByUtc)) {
    const ef = earlyFrac(utcDate);
    revByVnDate[utcDate] = (revByVnDate[utcDate] || 0) + total * ef;
    const next = addDay(utcDate, 1);
    revByVnDate[next] = (revByVnDate[next] || 0) + total * (1 - ef);
  }

  // Recent completed VN days should match the same event-ledger logic that
  // powered the live "today" cards before midnight. Older days keep complete
  // RevenueCat chart totals because historical renewal rows are not guaranteed
  // to be complete for the whole 30-day window.
  const correctionStart = vnDateIso(new Date(Date.now() - 7 * 86400 * 1000));
  const correctionEnd = vnDateIso(new Date(Date.now() - 86400 * 1000));
  const correctionStartUtc = new Date(`${correctionStart}T00:00:00+07:00`).toISOString();
  const correctionEndUtc = new Date(`${correctionEnd}T23:59:59.999+07:00`).toISOString();
  const renewalByUserDate = new Map<string, number>();
  const correctedRevenueByDate: Record<string, number> = {};
  const vnDate = (iso: string) => vnDateIso(new Date(iso));

  for (const r of renewalsResult.data || []) {
    const app = r.app_name || "Roomy AI";
    if (!VISIBLE_APPS.has(app) || !r.occurred_at) continue;
    if (r.occurred_at < correctionStartUtc || r.occurred_at > correctionEndUtc) continue;
    const date = vnDate(r.occurred_at);
    const revenue = r.revenue || 0;
    correctedRevenueByDate[date] = (correctedRevenueByDate[date] || 0) + revenue;
    const key = `${app}:${r.app_user_id}:${date}`;
    renewalByUserDate.set(key, (renewalByUserDate.get(key) || 0) + revenue);
  }

  for (const s of subsResult.data || []) {
    const app = s.app_name || "Roomy AI";
    if (!VISIBLE_APPS.has(app) || !s.purchased_at) continue;
    if (s.purchased_at < correctionStartUtc || s.purchased_at > correctionEndUtc) continue;
    const date = vnDate(s.purchased_at);
    const key = `${app}:${s.app_user_id}:${date}`;
    correctedRevenueByDate[date] = (correctedRevenueByDate[date] || 0) +
      Math.max(0, (s.revenue_gross || 0) - (renewalByUserDate.get(key) || 0));
  }

  for (const [date, revenue] of Object.entries(correctedRevenueByDate)) {
    if (revenue > 0) revByVnDate[date] = revenue;
  }

  return dates.map((date) => {
    const gross = revByVnDate[date] || 0;
    const net = gross * (1 - appleRate);
    const adspendUsd = spendUsdByDate[date] || 0;
    const adspendWithVat = adspendUsd * (1 + metaVat);
    return { date, revenue: gross, profit: net - adspendWithVat };
  });
}

type ProfitSummary = {
  total_revenue: number; // GROSS, all apps, new + renewal
  new_revenue: number; // GROSS, all apps, new subs only
  new_subs: number; // all apps
  apple_commission_rate: number; // e.g. 0.15
  meta_vat_rate: number; // e.g. 0.05
  net_revenue: number; // total_revenue after Apple cut
  net_new_revenue: number; // new_revenue after Apple cut
  adspend_usd: number; // raw media spend (excl. VAT)
  adspend_with_vat: number; // media spend incl. VAT — the real cost
  total_profit: number; // net_revenue - adspend_with_vat
  new_profit: number; // net_new_revenue - adspend_with_vat
  cost_per_new_sub: number; // adspend_with_vat / new_subs (0 if no new subs)
};

async function fetchTodayStats(): Promise<{
  today_vn: string;
  per_app: Record<string, TodayPerApp>;
  transactions: TodayTxn[];
  ads: MetaSpend;
  profit: ProfitSummary;
  daily: DailyPoint[];
}> {
  const { startUtc, endUtc } = vnDayBoundsUtc();

  // Apple commission + Meta VAT rates (env-configurable)
  const appleRate = parseFloat(process.env.APPLE_COMMISSION_RATE || "0.15");
  const metaVat = parseFloat(process.env.META_VAT_RATE || "0.05");

  // MRR per app + Meta ad spend + 30-day daily series, all in parallel
  const mrrByApp: Record<string, number> = {};
  const [, ads, daily] = await Promise.all([
    Promise.all(
      RC_PROJECTS
        .filter((p) => p.apiKey && p.projectId)
        .map(async (project) => {
          try {
            const res = await fetch(
              `${RC_BASE}/projects/${project.projectId}/metrics/overview`,
              { headers: rcHeaders(project.apiKey) }
            );
            if (!res.ok) {
              mrrByApp[project.name] = 0;
              return;
            }
            const json = await res.json();
            const arr: { id: string; value: number }[] = json.metrics || [];
            const map = Object.fromEntries(arr.map((x) => [x.id, x.value]));
            mrrByApp[project.name] = map.mrr || 0;
          } catch {
            mrrByApp[project.name] = 0;
          }
        })
    ),
    getTodayMetaSpend(),
    fetchDaily30d(appleRate, metaVat),
  ]);

  // New subs today (from rc_subscriptions where purchased_at is today VN)
  const { data: newSubs } = await supabase
    .from("rc_subscriptions")
    .select("app_user_id, app_name, country, product_id, store, purchased_at, expires_at, revenue_gross")
    .eq("environment", "production")
    .gte("purchased_at", startUtc)
    .lte("purchased_at", endUtc);

  // Renewals today (from rc_renewal_events)
  const { data: renewals } = await supabase
    .from("rc_renewal_events")
    .select("id, app_user_id, app_name, country, product_id, store, occurred_at, revenue")
    .gte("occurred_at", startUtc)
    .lte("occurred_at", endUtc);

  const renewalRows = (renewals || []).filter((row) => VISIBLE_APPS.has(row.app_name || "Roomy AI"));
  const renewalUserIds = Array.from(new Set(renewalRows.map((row) => row.app_user_id).filter(Boolean)));
  const { data: renewalSubs } = renewalUserIds.length > 0
    ? await supabase
        .from("rc_subscriptions")
        .select("app_user_id, app_name, purchased_at")
        .in("app_user_id", renewalUserIds)
    : { data: [] };

  const keyFor = (app: string, userId: string) => `${app}:${userId}`;
  const utcDay = (iso: string | null | undefined) => {
    if (!iso) return "";
    const time = new Date(iso).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : "";
  };
  const subscriptionStartByKey = new Map<string, string>();
  for (const row of renewalSubs || []) {
    const app = row.app_name || "Roomy AI";
    if (!VISIBLE_APPS.has(app) || !row.app_user_id || !row.purchased_at) continue;
    subscriptionStartByKey.set(keyFor(app, row.app_user_id), row.purchased_at);
  }

  // Aggregate per app
  const perApp: Record<string, TodayPerApp> = {};
  for (const appName of VISIBLE_APPS) {
    perApp[appName] = {
      today_revenue: 0,
      new_revenue: 0,
      new_subs: 0,
      mrr: mrrByApp[appName] || 0,
    };
  }

  const txns: TodayTxn[] = [];
  const sameDayNewSubRenewalIds = new Set<string>();
  const countedNewSubKeys = new Set<string>();

  for (const row of newSubs || []) {
    const app = row.app_name || "Roomy AI";
    if (!VISIBLE_APPS.has(app)) continue;
    const customerKey = keyFor(app, row.app_user_id);

    // rc_subscriptions is a customer summary, not an event ledger. If someone
    // starts weekly and upgrades to yearly minutes later, revenue_gross can
    // contain the later plan's/lifetime value and double-count today's renewal.
    const sameDayRenewals = renewalRows.filter((r) => {
      if (r.app_user_id !== row.app_user_id) return false;
      if ((r.app_name || "Roomy AI") !== app) return false;
      if (!row.purchased_at || !r.occurred_at) return false;
      return new Date(r.occurred_at).getTime() >= new Date(row.purchased_at).getTime();
    });
    const hasSameDayUpgrade = sameDayRenewals.length > 0;
    for (const renewal of sameDayRenewals) {
      sameDayNewSubRenewalIds.add(renewal.id);
    }

    const rev = hasSameDayUpgrade ? 0 : row.revenue_gross || 0;
    perApp[app].new_revenue += rev;
    perApp[app].today_revenue += rev;
    perApp[app].new_subs += 1;
    countedNewSubKeys.add(customerKey);

    if (!hasSameDayUpgrade) {
      txns.push({
        id: row.app_user_id,
        country: (row.country || "").toUpperCase(),
        app,
        plan: planName(row.product_id || ""),
        product_id: row.product_id || "",
        store: row.store || "app_store",
        occurred_at: row.purchased_at || "",
        expires_at: row.expires_at || "",
        revenue: rev,
        type: "NEW_SUB",
      });
    }
  }

  for (const row of renewalRows) {
    const app = row.app_name || "Roomy AI";
    const customerKey = keyFor(app, row.app_user_id);
    const rev = row.revenue || 0;
    const subscriptionStartedAt = subscriptionStartByKey.get(customerKey);
    const isSameRevenueCatDayUpgrade =
      sameDayNewSubRenewalIds.has(row.id) ||
      (!!subscriptionStartedAt && utcDay(subscriptionStartedAt) === utcDay(row.occurred_at));

    perApp[app].today_revenue += rev;
    if (isSameRevenueCatDayUpgrade) {
      perApp[app].new_revenue += rev;
      if (!countedNewSubKeys.has(customerKey)) {
        perApp[app].new_subs += 1;
        countedNewSubKeys.add(customerKey);
      }
    }
    txns.push({
      id: row.app_user_id,
      country: (row.country || "").toUpperCase(),
      app,
      plan: planName(row.product_id || ""),
      product_id: row.product_id || "",
      store: row.store || "app_store",
      occurred_at: row.occurred_at || "",
      expires_at: "",
      revenue: rev,
      type: isSameRevenueCatDayUpgrade ? "NEW_SUB" : "RENEWAL",
    });
  }

  // Most recent first
  txns.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  // Combined profit summary across all visible apps
  let sumRevenue = 0;
  let sumNewRevenue = 0;
  let sumNewSubs = 0;
  for (const appName of VISIBLE_APPS) {
    sumRevenue += perApp[appName].today_revenue;
    sumNewRevenue += perApp[appName].new_revenue;
    sumNewSubs += perApp[appName].new_subs;
  }
  // Apple takes a commission (net of it = what we receive); Meta ad spend in
  // the API excludes VAT, which Vietnam adds on top. Rates read above.
  const adspendUsd = ads.spend_usd || 0;
  const adspendWithVat = adspendUsd * (1 + metaVat);
  const netRevenue = sumRevenue * (1 - appleRate);
  const netNewRevenue = sumNewRevenue * (1 - appleRate);

  const profit: ProfitSummary = {
    total_revenue: sumRevenue,
    new_revenue: sumNewRevenue,
    new_subs: sumNewSubs,
    apple_commission_rate: appleRate,
    meta_vat_rate: metaVat,
    net_revenue: netRevenue,
    net_new_revenue: netNewRevenue,
    adspend_usd: adspendUsd,
    adspend_with_vat: adspendWithVat,
    total_profit: netRevenue - adspendWithVat,
    new_profit: netNewRevenue - adspendWithVat,
    cost_per_new_sub: sumNewSubs > 0 ? adspendWithVat / sumNewSubs : 0,
  };

  // The current UTC day is incomplete in the RC chart (and UTC lags GMT+7 by
  // 7h, so it's barely started), which undercounts "today". Override the most
  // recent daily point with the accurate DB-based numbers (same source as the
  // profit boxes) so the chart's last point matches the boxes above it.
  if (daily.length) {
    const last = daily[daily.length - 1];
    last.revenue = sumRevenue;
    last.profit = profit.total_profit;
  }

  return { today_vn: vnDateIso(), per_app: perApp, transactions: txns, ads, profit, daily };
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

    if (type === "today_stats") {
      const data = await fetchTodayStats();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "type must be 'overview', 'subscribers', or 'today_stats'" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
