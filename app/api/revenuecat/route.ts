import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getTodayMetaSpend, getMetaSpendByDay, type MetaSpend } from "@/lib/meta/ads";

export const maxDuration = 300;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let overviewCache: { data: unknown; timestamp: number } | null = null;
let transactionLedgerCache: { key: string; data: TransactionLedger; timestamp: number } | null = null;

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
const TRANSACTION_CONCURRENCY = 6;

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

function valueMs(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  return dateMs(value);
}

function msToIso(ms: number | null): string {
  return ms == null ? "" : new Date(ms).toISOString();
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

export type DailyPoint = { date: string; revenue: number; profit: number };

type RcProject = (typeof RC_PROJECTS)[number];
type RcList<T> = { items?: T[]; next_page?: string | null };
type RcCustomer = { id?: string; last_seen_country?: string | null; country?: string | null };
type RcSubscription = {
  id?: string;
  product_id?: string | null;
  product_store_identifier?: string | null;
  store?: string | null;
  environment?: string | null;
};
type RcSubscriptionTransaction = {
  id?: string;
  purchased_at?: number | string | null;
  product_id?: string | null;
  product_store_identifier?: string | null;
  revenue_in_usd?: { gross?: number | string | null };
  expiration_date?: number | string | null;
  effective_expiration_date?: number | string | null;
};
type CustomerSeed = { app: string; userId: string; country: string };
type TransactionEvent = {
  id: string;
  app: string;
  userId: string;
  country: string;
  productId: string;
  store: string;
  purchasedAt: string;
  purchasedMs: number;
  expiresAt: string;
  date: string;
  gross: number;
};
type TransactionLedger = {
  events: TransactionEvent[];
  firstPaidAtByCustomer: Map<string, string>;
};

class RevenueCatApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function configuredProjects(): RcProject[] {
  return RC_PROJECTS.filter((p) => p.apiKey && p.projectId && VISIBLE_APPS.has(p.name));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rcPageUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return new URL(pathOrUrl, pathOrUrl.startsWith("/") ? "https://api.revenuecat.com" : `${RC_BASE}/`).toString();
}

async function rcJson<T>(apiKey: string, url: string): Promise<T> {
  let lastStatus = 0;
  let lastMessage = "RevenueCat request failed";

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: rcHeaders(apiKey) });
    if (res.ok) return (await res.json()) as T;

    lastStatus = res.status;
    lastMessage = `RevenueCat ${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (res.status !== 429 && res.status < 500) break;

    const retryAfter = Number(res.headers.get("retry-after") || 0);
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 900 * (attempt + 1));
  }

  throw new RevenueCatApiError(lastStatus, lastMessage);
}

async function fetchRcList<T>(apiKey: string, firstUrl: string): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = firstUrl;
  let pages = 0;

  while (nextUrl && pages < 200) {
    const json: RcList<T> = await rcJson<RcList<T>>(apiKey, nextUrl);
    items.push(...(json.items || []));
    nextUrl = json.next_page ? rcPageUrl(json.next_page) : null;
    pages++;
  }

  return items;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function fetchDbCustomerSeeds(): Promise<{
  seedsByApp: Map<string, CustomerSeed[]>;
  firstPaidAtByCustomer: Map<string, string>;
}> {
  const { data, error } = await supabase
    .from("rc_subscriptions")
    .select("app_user_id, app_name, country, purchased_at")
    .eq("environment", "production");

  if (error) throw new Error(`Database error: ${error.message}`);

  const seedMapsByApp = new Map<string, Map<string, CustomerSeed>>();
  const firstPaidAtByCustomer = new Map<string, string>();

  for (const row of data || []) {
    const app = visibleAppName(row.app_name);
    const userId = row.app_user_id || "";
    if (!app || !userId) continue;

    let seedMap = seedMapsByApp.get(app);
    if (!seedMap) {
      seedMap = new Map<string, CustomerSeed>();
      seedMapsByApp.set(app, seedMap);
    }
    const existingSeed = seedMap.get(userId);
    seedMap.set(userId, {
      app,
      userId,
      country: (existingSeed?.country || row.country || "").toUpperCase(),
    });

    const purchasedMs = dateMs(row.purchased_at);
    if (purchasedMs != null && row.purchased_at) {
      const key = keyFor(app, userId);
      const existingMs = dateMs(firstPaidAtByCustomer.get(key));
      if (existingMs == null || purchasedMs < existingMs) {
        firstPaidAtByCustomer.set(key, row.purchased_at);
      }
    }
  }

  const seedsByApp = new Map<string, CustomerSeed[]>();
  for (const [app, seedMap] of seedMapsByApp) {
    seedsByApp.set(app, Array.from(seedMap.values()));
  }

  return { seedsByApp, firstPaidAtByCustomer };
}

async function fetchRevenueCatCustomerSeeds(project: RcProject): Promise<CustomerSeed[]> {
  const customers = await fetchRcList<RcCustomer>(
    project.apiKey,
    `${RC_BASE}/projects/${project.projectId}/customers?limit=100`
  );

  return customers
    .filter((customer) => Boolean(customer.id))
    .map((customer) => ({
      app: project.name,
      userId: customer.id || "",
      country: (customer.country || customer.last_seen_country || "").toUpperCase(),
    }));
}

async function fetchCustomerTransactionEvents(
  project: RcProject,
  seed: CustomerSeed,
  startMs: number,
  endMs: number
): Promise<{ events: TransactionEvent[]; firstPaidAt: string | null }> {
  const encodedCustomerId = encodeURIComponent(seed.userId);
  let firstPaidMs: number | null = null;
  const events: TransactionEvent[] = [];

  try {
    const subscriptions = await fetchRcList<RcSubscription>(
      project.apiKey,
      `${RC_BASE}/projects/${project.projectId}/customers/${encodedCustomerId}/subscriptions?limit=100`
    );

    for (const subscription of subscriptions) {
      if (!subscription.id) continue;
      if ((subscription.environment || "").toLowerCase() === "sandbox") continue;

      const encodedSubscriptionId = encodeURIComponent(subscription.id);
      const transactions = await fetchRcList<RcSubscriptionTransaction>(
        project.apiKey,
        `${RC_BASE}/projects/${project.projectId}/subscriptions/${encodedSubscriptionId}/transactions?limit=100`
      );

      for (const transaction of transactions) {
        const purchasedMs = valueMs(transaction.purchased_at);
        if (purchasedMs == null) continue;

        const gross = money(transaction.revenue_in_usd?.gross);
        if (Math.abs(gross) < 0.000001) continue;

        if (firstPaidMs == null || purchasedMs < firstPaidMs) {
          firstPaidMs = purchasedMs;
        }

        if (purchasedMs < startMs || purchasedMs >= endMs) continue;

        const productId =
          transaction.product_store_identifier ||
          transaction.product_id ||
          subscription.product_store_identifier ||
          subscription.product_id ||
          "";
        const expiresMs = valueMs(transaction.effective_expiration_date ?? transaction.expiration_date);

        events.push({
          id: transaction.id || `${project.name}:${seed.userId}:${productId}:${purchasedMs}:${gross}`,
          app: project.name,
          userId: seed.userId,
          country: seed.country,
          productId,
          store: (subscription.store || "app_store").toLowerCase(),
          purchasedAt: new Date(purchasedMs).toISOString(),
          purchasedMs,
          expiresAt: msToIso(expiresMs),
          date: vnDateIso(new Date(purchasedMs)),
          gross,
        });
      }
    }
  } catch (err) {
    if (err instanceof RevenueCatApiError && err.status === 404) {
      return { events: [], firstPaidAt: null };
    }
    throw err;
  }

  return { events, firstPaidAt: msToIso(firstPaidMs) || null };
}

async function fetchTransactionLedger(startDate: string, endExclusiveDate: string): Promise<TransactionLedger> {
  const { startUtc } = vnDayBoundsUtc(startDate);
  const { startUtc: endUtc } = vnDayBoundsUtc(endExclusiveDate);
  const startMs = new Date(startUtc).getTime();
  const endMs = new Date(endUtc).getTime();
  const projectKey = configuredProjects().map((project) => `${project.name}:${project.projectId}`).join("|");
  const cacheKey = `${projectKey}:${startUtc}:${endUtc}`;

  if (transactionLedgerCache && transactionLedgerCache.key === cacheKey && Date.now() - transactionLedgerCache.timestamp < CACHE_TTL) {
    return transactionLedgerCache.data;
  }

  const dbSeeds = await fetchDbCustomerSeeds();
  const firstPaidAtByCustomer = new Map(dbSeeds.firstPaidAtByCustomer);
  const events: TransactionEvent[] = [];

  for (const project of configuredProjects()) {
    const seedMap = new Map<string, CustomerSeed>();

    for (const seed of dbSeeds.seedsByApp.get(project.name) || []) {
      seedMap.set(seed.userId, seed);
    }

    for (const seed of await fetchRevenueCatCustomerSeeds(project)) {
      const existing = seedMap.get(seed.userId);
      seedMap.set(seed.userId, {
        ...seed,
        country: existing?.country || seed.country,
      });
    }

    const seeds = Array.from(seedMap.values());
    const results = await mapLimit(seeds, TRANSACTION_CONCURRENCY, (seed) =>
      fetchCustomerTransactionEvents(project, seed, startMs, endMs)
    );

    for (let i = 0; i < results.length; i++) {
      const seed = seeds[i];
      const result = results[i];
      events.push(...result.events);

      const key = keyFor(project.name, seed.userId);
      const fetchedFirstMs = dateMs(result.firstPaidAt);
      const existingFirstMs = dateMs(firstPaidAtByCustomer.get(key));
      if (fetchedFirstMs != null && (existingFirstMs == null || fetchedFirstMs < existingFirstMs)) {
        firstPaidAtByCustomer.set(key, result.firstPaidAt || "");
      }
    }
  }

  events.sort((a, b) => a.purchasedMs - b.purchasedMs);
  const data = { events, firstPaidAtByCustomer };
  transactionLedgerCache = { key: cacheKey, data, timestamp: Date.now() };
  return data;
}

function isNewSubEvent(event: TransactionEvent, ledger: TransactionLedger): boolean {
  const firstPaidAt = ledger.firstPaidAtByCustomer.get(keyFor(event.app, event.userId));
  return sameVnDayOrLater(firstPaidAt, event.purchasedAt);
}

function buildDailyPointsFromLedger(
  dates: string[],
  events: TransactionEvent[],
  spendUsdByDate: Record<string, number>,
  appleRate: number,
  metaVat: number
): DailyPoint[] {
  const revenueByDate: Record<string, number> = {};
  for (const event of events) {
    revenueByDate[event.date] = (revenueByDate[event.date] || 0) + event.gross;
  }

  return dates.map((date) => {
    const gross = revenueByDate[date] || 0;
    const net = gross * (1 - appleRate);
    const adspendWithVat = (spendUsdByDate[date] || 0) * (1 + metaVat);
    return { date, revenue: gross, profit: net - adspendWithVat };
  });
}

function buildTodayLedgerFromTransactions(
  ledger: TransactionLedger,
  today: string,
  mrrByApp: Record<string, number>
): { perApp: Record<string, TodayPerApp>; transactions: TodayTxn[] } {
  const perApp = emptyPerApp(mrrByApp);
  const countedNewSubs = new Set<string>();
  const groups = new Map<string, { type: "NEW_SUB" | "RENEWAL"; latest: TransactionEvent; revenue: number }>();

  for (const event of ledger.events) {
    if (event.date !== today) continue;

    const type = isNewSubEvent(event, ledger) ? "NEW_SUB" : "RENEWAL";
    const appStats = perApp[event.app];
    if (!appStats) continue;

    appStats.today_revenue += event.gross;
    if (type === "NEW_SUB") {
      appStats.new_revenue += event.gross;
      const countKey = dateKeyFor(event.app, event.userId, event.date);
      if (!countedNewSubs.has(countKey)) {
        appStats.new_subs += 1;
        countedNewSubs.add(countKey);
      }
    }

    const groupKey = `${dateKeyFor(event.app, event.userId, event.date)}:${type}`;
    const group = groups.get(groupKey);
    if (!group) {
      groups.set(groupKey, { type, latest: event, revenue: event.gross });
    } else {
      group.revenue += event.gross;
      if (event.purchasedMs > group.latest.purchasedMs) group.latest = event;
    }
  }

  const transactions = Array.from(groups.values())
    .map((group) => ({
      id: group.latest.userId,
      country: group.latest.country,
      app: group.latest.app,
      plan: planName(group.latest.productId),
      product_id: group.latest.productId,
      store: group.latest.store,
      occurred_at: group.latest.purchasedAt,
      expires_at: group.latest.expiresAt,
      revenue: group.revenue,
      type: group.type,
    }))
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  return { perApp, transactions };
}

async function fetchMrrByApp(): Promise<Record<string, number>> {
  const mrrByApp: Record<string, number> = {};

  await Promise.all(
    configuredProjects().map(async (project) => {
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
  );

  return mrrByApp;
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
  const dates = vnDateWindow(today, 30);
  const start = dates[0];
  const endExclusive = addVnDays(today, 1);

  // Apple commission + Meta VAT rates (env-configurable)
  const appleRate = parseFloat(process.env.APPLE_COMMISSION_RATE || "0.15");
  const metaVat = parseFloat(process.env.META_VAT_RATE || "0.05");

  const [mrrByApp, ads, spendUsdByDate, ledger] = await Promise.all([
    fetchMrrByApp(),
    getTodayMetaSpend(),
    getMetaSpendByDay(start, today),
    fetchTransactionLedger(start, endExclusive),
  ]);

  if (ads.configured && !ads.error && ads.date === today) {
    spendUsdByDate[today] = ads.spend_usd || 0;
  }

  const daily = buildDailyPointsFromLedger(dates, ledger.events, spendUsdByDate, appleRate, metaVat);
  const todayLedger = buildTodayLedgerFromTransactions(ledger, today, mrrByApp);
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
