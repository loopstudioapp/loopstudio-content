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
const VN_UTC_OFFSET = "+07:00";
const MS_PER_DAY = 86_400_000;
const RECENT_COMPLETED_LEDGER_DAYS = 2;

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

function dateMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function addIsoDateDays(dateStr: string, n: number): string {
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + n * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

function addVnDays(dateStr: string, n: number): string {
  return vnDateIso(new Date(new Date(`${dateStr}T00:00:00${VN_UTC_OFFSET}`).getTime() + n * MS_PER_DAY));
}

function vnDateWindow(endDate: string, days: number): string[] {
  const startDate = addVnDays(endDate, -(days - 1));
  return Array.from({ length: days }, (_, i) => addVnDays(startDate, i));
}

function vnDayBoundsUtc(dateStr: string = vnDateIso()): { startUtc: string; endUtc: string } {
  const startMs = new Date(`${dateStr}T00:00:00${VN_UTC_OFFSET}`).getTime();
  const startUtc = new Date(startMs).toISOString();
  const endUtc = new Date(startMs + MS_PER_DAY).toISOString();
  return { startUtc, endUtc };
}

function sameVnDayOrLater(startedAt: string | null | undefined, occurredAt: string | null | undefined): boolean {
  const startedMs = dateMs(startedAt);
  const occurredMs = dateMs(occurredAt);
  if (startedMs == null || occurredMs == null || occurredMs < startedMs) return false;
  return vnDateIso(new Date(startedMs)) === vnDateIso(new Date(occurredMs));
}

function visibleAppName(appName: string | null | undefined): string | null {
  const app = appName || "Roomy AI";
  return VISIBLE_APPS.has(app) ? app : null;
}

function money(value: number | string | null | undefined): number {
  const amount = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function keyFor(app: string, userId: string) {
  return `${app}:${userId}`;
}

function dateKeyFor(app: string, userId: string, date: string) {
  return `${app}:${userId}:${date}`;
}

type SubscriptionSummaryRow = {
  app_user_id?: string | null;
  app_name?: string | null;
  country?: string | null;
  product_id?: string | null;
  store?: string | null;
  purchased_at?: string | null;
  expires_at?: string | null;
  revenue_gross?: number | null;
};

type RenewalEventRow = {
  id?: string | null;
  app_user_id?: string | null;
  app_name?: string | null;
  country?: string | null;
  product_id?: string | null;
  store?: string | null;
  occurred_at?: string | null;
  revenue?: number | null;
};

type DbLedgerResult = {
  perApp: Record<string, TodayPerApp>;
  transactions: TodayTxn[];
  revenueByDate: Record<string, number>;
};

function emptyPerApp(mrrByApp: Record<string, number> = {}): Record<string, TodayPerApp> {
  const perApp: Record<string, TodayPerApp> = {};
  for (const appName of VISIBLE_APPS) {
    perApp[appName] = {
      today_revenue: 0,
      new_revenue: 0,
      new_subs: 0,
      mrr: mrrByApp[appName] || 0,
    };
  }
  return perApp;
}

function buildDbRevenueLedger({
  newSubs,
  renewals,
  mrrByApp = {},
  includeTransactions = false,
  allowedDates,
  subscriptionStartByKey: providedSubscriptionStartByKey,
}: {
  newSubs: SubscriptionSummaryRow[];
  renewals: RenewalEventRow[];
  mrrByApp?: Record<string, number>;
  includeTransactions?: boolean;
  allowedDates?: Set<string>;
  subscriptionStartByKey?: Map<string, string>;
}): DbLedgerResult {
  const perApp = emptyPerApp(mrrByApp);
  const transactions: TodayTxn[] = [];
  const revenueByDate: Record<string, number> = {};
  const subscriptionStartByKey = new Map(providedSubscriptionStartByKey || []);

  type NormalizedSub = {
    app: string;
    userId: string;
    date: string;
    customerKey: string;
    customerDateKey: string;
    purchasedAt: string;
    purchasedMs: number;
    country: string;
    productId: string;
    store: string;
    expiresAt: string;
    revenueGross: number;
  };
  type NormalizedRenewal = {
    id: string;
    app: string;
    userId: string;
    date: string;
    customerKey: string;
    customerDateKey: string;
    occurredAt: string;
    occurredMs: number;
    country: string;
    productId: string;
    store: string;
    revenue: number;
  };

  const normalizedSubs: NormalizedSub[] = [];
  for (const row of newSubs) {
    const app = visibleAppName(row.app_name);
    const userId = row.app_user_id || "";
    const purchasedMs = dateMs(row.purchased_at);
    if (!app || !userId || purchasedMs == null || !row.purchased_at) continue;
    const date = vnDateIso(new Date(purchasedMs));
    if (allowedDates && !allowedDates.has(date)) continue;

    const customerKey = keyFor(app, userId);
    const existingStartMs = dateMs(subscriptionStartByKey.get(customerKey));
    if (existingStartMs == null || purchasedMs < existingStartMs) {
      subscriptionStartByKey.set(customerKey, row.purchased_at);
    }

    normalizedSubs.push({
      app,
      userId,
      date,
      customerKey,
      customerDateKey: dateKeyFor(app, userId, date),
      purchasedAt: row.purchased_at,
      purchasedMs,
      country: (row.country || "").toUpperCase(),
      productId: row.product_id || "",
      store: row.store || "app_store",
      expiresAt: row.expires_at || "",
      revenueGross: money(row.revenue_gross),
    });
  }

  const normalizedRenewals: NormalizedRenewal[] = [];
  for (const row of renewals) {
    const app = visibleAppName(row.app_name);
    const userId = row.app_user_id || "";
    const occurredMs = dateMs(row.occurred_at);
    if (!app || !userId || occurredMs == null || !row.occurred_at) continue;
    const date = vnDateIso(new Date(occurredMs));
    if (allowedDates && !allowedDates.has(date)) continue;

    normalizedRenewals.push({
      id: row.id || `renewal:${app}:${userId}:${row.product_id || ""}:${row.occurred_at}:${row.revenue || 0}`,
      app,
      userId,
      date,
      customerKey: keyFor(app, userId),
      customerDateKey: dateKeyFor(app, userId, date),
      occurredAt: row.occurred_at,
      occurredMs,
      country: (row.country || "").toUpperCase(),
      productId: row.product_id || "",
      store: row.store || "app_store",
      revenue: money(row.revenue),
    });
  }

  const renewalsByCustomerDate = new Map<string, NormalizedRenewal[]>();
  for (const renewal of normalizedRenewals) {
    const list = renewalsByCustomerDate.get(renewal.customerDateKey) || [];
    list.push(renewal);
    renewalsByCustomerDate.set(renewal.customerDateKey, list);
  }

  const sameDayNewSubRenewalIds = new Set<string>();
  const countedNewSubDateKeys = new Set<string>();

  for (const sub of normalizedSubs) {
    // rc_subscriptions is a mutable customer summary. If a same-VN-day renewal
    // or upgrade exists, use that event row as the money event instead.
    const sameDayMoneyEvents = (renewalsByCustomerDate.get(sub.customerDateKey) || []).filter(
      (renewal) => renewal.occurredMs >= sub.purchasedMs
    );
    const hasSameDayMoneyEvent = sameDayMoneyEvents.length > 0;
    for (const renewal of sameDayMoneyEvents) {
      sameDayNewSubRenewalIds.add(renewal.id);
    }

    const revenue = hasSameDayMoneyEvent ? 0 : sub.revenueGross;
    revenueByDate[sub.date] = (revenueByDate[sub.date] || 0) + revenue;
    perApp[sub.app].today_revenue += revenue;
    perApp[sub.app].new_revenue += revenue;
    if (!countedNewSubDateKeys.has(sub.customerDateKey)) {
      perApp[sub.app].new_subs += 1;
      countedNewSubDateKeys.add(sub.customerDateKey);
    }

    if (includeTransactions && !hasSameDayMoneyEvent) {
      transactions.push({
        id: sub.userId,
        country: sub.country,
        app: sub.app,
        plan: planName(sub.productId),
        product_id: sub.productId,
        store: sub.store,
        occurred_at: sub.purchasedAt,
        expires_at: sub.expiresAt,
        revenue,
        type: "NEW_SUB",
      });
    }
  }

  for (const renewal of normalizedRenewals) {
    const subscriptionStartedAt = subscriptionStartByKey.get(renewal.customerKey);
    const isSameVnDayUpgrade =
      sameDayNewSubRenewalIds.has(renewal.id) ||
      sameVnDayOrLater(subscriptionStartedAt, renewal.occurredAt);

    revenueByDate[renewal.date] = (revenueByDate[renewal.date] || 0) + renewal.revenue;
    perApp[renewal.app].today_revenue += renewal.revenue;
    if (isSameVnDayUpgrade) {
      perApp[renewal.app].new_revenue += renewal.revenue;
      if (!countedNewSubDateKeys.has(renewal.customerDateKey)) {
        perApp[renewal.app].new_subs += 1;
        countedNewSubDateKeys.add(renewal.customerDateKey);
      }
    }

    if (includeTransactions) {
      transactions.push({
        id: renewal.userId,
        country: renewal.country,
        app: renewal.app,
        plan: planName(renewal.productId),
        product_id: renewal.productId,
        store: renewal.store,
        occurred_at: renewal.occurredAt,
        expires_at: "",
        revenue: renewal.revenue,
        type: isSameVnDayUpgrade ? "NEW_SUB" : "RENEWAL",
      });
    }
  }

  transactions.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  return { perApp, transactions, revenueByDate };
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
  const dates = vnDateWindow(today, 30);
  const start = dates[0];
  const rcStart = addIsoDateDays(start, -1);
  const rcEnd = new Date().toISOString().slice(0, 10);

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
      .select("id, app_user_id, app_name, country, product_id, store, occurred_at, revenue")
      .gte("occurred_at", `${rcStart}T00:00:00Z`)
      .lt("occurred_at", `${addIsoDateDays(rcEnd, 1)}T00:00:00Z`),
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
  const sameVnDayRenewalKeys = new Set<string>();
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
    if (!r.app_user_id || !r.occurred_at) continue;
    const occurredMs = dateMs(r.occurred_at);
    if (occurredMs == null) continue;
    sameVnDayRenewalKeys.add(dateKeyFor(app, r.app_user_id, vnDateIso(new Date(occurredMs))));
    addSplitWeight(r.occurred_at, r.revenue || 0);
  }

  for (const s of subsResult.data || []) {
    if (!VISIBLE_APPS.has(s.app_name || "Roomy AI")) continue;
    if (!s.app_user_id || !s.purchased_at) continue;
    const purchasedMs = dateMs(s.purchased_at);
    if (purchasedMs == null) continue;
    const app = s.app_name || "Roomy AI";
    const key = dateKeyFor(app, s.app_user_id, vnDateIso(new Date(purchasedMs)));
    if (sameVnDayRenewalKeys.has(key)) continue;
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
    const next = addIsoDateDays(utcDate, 1);
    revByVnDate[next] = (revByVnDate[next] || 0) + total * (1 - ef);
  }

  // Only the freshest completed VN days use the DB ledger, matching what the
  // live cards showed before midnight. Older chart points stay RevenueCat-
  // anchored because rc_renewal_events is not a complete historical ledger.
  const completedLedgerDates = new Set(
    Array.from({ length: RECENT_COMPLETED_LEDGER_DAYS }, (_, i) =>
      addVnDays(today, -(RECENT_COMPLETED_LEDGER_DAYS - i))
    )
  );
  const correctedLedger = buildDbRevenueLedger({
    newSubs: subsResult.data || [],
    renewals: renewalsResult.data || [],
    allowedDates: completedLedgerDates,
  });

  for (const date of completedLedgerDates) {
    revByVnDate[date] = correctedLedger.revenueByDate[date] || 0;
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
  const today = vnDateIso();
  const { startUtc, endUtc } = vnDayBoundsUtc(today);

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
    .lt("purchased_at", endUtc);

  // Renewals today (from rc_renewal_events)
  const { data: renewals } = await supabase
    .from("rc_renewal_events")
    .select("id, app_user_id, app_name, country, product_id, store, occurred_at, revenue")
    .gte("occurred_at", startUtc)
    .lt("occurred_at", endUtc);

  const renewalRows = (renewals || []).filter((row) => VISIBLE_APPS.has(row.app_name || "Roomy AI"));
  const renewalUserIds = Array.from(new Set(renewalRows.map((row) => row.app_user_id).filter(Boolean)));
  const { data: renewalSubs } = renewalUserIds.length > 0
    ? await supabase
        .from("rc_subscriptions")
        .select("app_user_id, app_name, purchased_at")
        .in("app_user_id", renewalUserIds)
    : { data: [] };

  const subscriptionStartByKey = new Map<string, string>();
  for (const row of renewalSubs || []) {
    const app = row.app_name || "Roomy AI";
    if (!VISIBLE_APPS.has(app) || !row.app_user_id || !row.purchased_at) continue;
    subscriptionStartByKey.set(keyFor(app, row.app_user_id), row.purchased_at);
  }

  const todayLedger = buildDbRevenueLedger({
    newSubs: newSubs || [],
    renewals: renewalRows,
    mrrByApp,
    includeTransactions: true,
    allowedDates: new Set([today]),
    subscriptionStartByKey,
  });
  const perApp = todayLedger.perApp;
  const txns = todayLedger.transactions;

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

  return { today_vn: today, per_app: perApp, transactions: txns, ads, profit, daily };
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
