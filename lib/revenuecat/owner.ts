import type { DailyPoint, TodayStatsResponse } from "@/app/api/revenuecat/route";

export const OWNER_APPS = ["GrailScan", "AskMed"] as const;
export type OwnerApp = (typeof OWNER_APPS)[number];
export type AppBreakdown = Record<OwnerApp, { revenue: number; new_subs: number }>;
/** Share of gross revenue Apple pays out, per app: today's and per Vietnam day. */
export type KeptShares = { current: Record<OwnerApp, number>; by_date?: Record<OwnerApp, Record<string, number>> };

/** Google's cut of Play subscription sales (15%; Play's own payout report isn't connected). */
export const GOOGLE_PLAY_FEE = 0.15;
/** "How did you find AskMed?" answers grouped for the owner page (Loop 2026-11-12). */
export const ANDROID_SOURCES = ["meta", "organic", "seo", "play_store", "friend", "other"] as const;
export type AndroidSource = (typeof ANDROID_SOURCES)[number];
export function androidSourceGroup(answer: string | null | undefined): AndroidSource {
  switch (answer) {
    case "facebook": case "instagram": return "meta";
    case "tiktok": case "lemon8": return "organic";
    case "google": case "website": return "seo";
    case "play_store": return "play_store";
    case "friend": return "friend";
    default: return "other"; // "other", no answer, or bought before the question existed
  }
}
/** One part of a day's profit. revenue is gross; refunds are the evenly spread 30-day net refunds. */
export type PlatformPart = {
  revenue: number; refunds: number; store_cut: number; meta: number; revenuecat: number;
  openrouter: number; ai_ads: number; profit: number; new_subs: number;
};
export type PlatformDay = {
  grailscan: PlatformPart;
  ios: PlatformPart;
  android: PlatformPart & { sources: Record<AndroidSource, number> };
  /** false when this day has no saved Google Play numbers yet (all AskMed money shows as iOS). */
  android_known: boolean;
};
export type PlatformInputs = {
  /** Meta spend per Vietnam day by campaign platform, any currency (only the ratio is used). */
  metaSpendByDate?: Record<string, { ios: number; android: number }>;
  /** "How did you find AskMed?" answer per RevenueCat app user id. */
  foundViaByUser?: Record<string, string>;
  /** Google Play's real payout share (after its fee and the taxes it keeps); 85% when unknown. */
  googleKept?: { current: number; by_date?: Record<string, number> };
};
const emptyPart = (): PlatformPart => ({
  revenue: 0, refunds: 0, store_cut: 0, meta: 0, revenuecat: 0, openrouter: 0, ai_ads: 0, profit: 0, new_subs: 0,
});

/** Combine app ledgers, not their profits: the provider ledger is shared. */
export function combineOwnerStats(grail: TodayStatsResponse, askmed: TodayStatsResponse, kept?: KeptShares, inputs: PlatformInputs = {}) {
  if (grail.today_vn !== askmed.today_vn || !grail.per_app.GrailScan || !askmed.per_app.AskMed) {
    throw new Error("Both app snapshots must cover the same reporting day");
  }
  const askDays = new Map(askmed.daily.map(day => [day.date, day]));
  if (grail.daily.length !== askmed.daily.length || grail.daily.some(day => !askDays.has(day.date))) {
    throw new Error("Both apps must have a complete matching daily history");
  }
  const appleRate = grail.profit.apple_commission_rate;
  // Apple's real proceeds (after its 15% and local taxes); the flat rate is only a fallback.
  const keptFor = (app: OwnerApp, date: string) => kept?.by_date?.[app]?.[date] ?? kept?.current[app] ?? 1 - appleRate;
  const afterRefunds = (day: DailyPoint) => day.revenue - (day.refund_amount || 0) + (day.refund_reversed_amount || 0);
  // Google Play refunds are spread evenly over the 30 days, like each app's own refunds.
  const androidRefundNet = askmed.daily.reduce((sum, day) =>
    sum + (day.android?.refund_source_amount || 0) - (day.android?.refund_source_reversed_amount || 0), 0) / (askmed.daily.length || 1);
  const parts = new Map<string, { grailscan: PlatformPart; ios: PlatformPart; android: PlatformPart; known: boolean; userRevenue: Record<string, number> }>();
  const daily = grail.daily.map((g): DailyPoint & { per_app: AppBreakdown; apple_cost: number; google_cost: number } => {
    const a = askDays.get(g.date)!;
    const revenue = g.revenue + a.revenue;
    const newSubs = g.new_subs + a.new_subs;
    const known = Boolean(a.android);
    const grailPart = emptyPart(), iosPart = emptyPart(), androidPart = emptyPart();
    grailPart.revenue = g.revenue;
    grailPart.refunds = (g.refund_amount || 0) - (g.refund_reversed_amount || 0);
    grailPart.new_subs = g.new_subs;
    androidPart.revenue = known ? a.android!.revenue : 0;
    androidPart.refunds = known ? androidRefundNet : 0;
    androidPart.new_subs = known ? a.android!.new_subs : 0;
    iosPart.revenue = a.revenue - androidPart.revenue;
    iosPart.refunds = (a.refund_amount || 0) - (a.refund_reversed_amount || 0) - androidPart.refunds;
    iosPart.new_subs = Math.max(0, a.new_subs - androidPart.new_subs);
    const net = (part: PlatformPart) => part.revenue - part.refunds;
    grailPart.store_cut = net(grailPart) * (1 - keptFor("GrailScan", g.date));
    iosPart.store_cut = net(iosPart) * (1 - keptFor("AskMed", g.date));
    const googleKept = inputs.googleKept?.by_date?.[g.date] ?? inputs.googleKept?.current ?? 1 - GOOGLE_PLAY_FEE;
    androidPart.store_cut = net(androidPart) * (1 - googleKept);
    parts.set(g.date, { grailscan: grailPart, ios: iosPart, android: androidPart, known, userRevenue: known ? a.android!.by_user : {} });
    const appleCost = grailPart.store_cut + iosPart.store_cut;
    return {
      ...g,
      apple_cost: appleCost,
      google_cost: androidPart.store_cut,
      revenue,
      purchase_revenue: (g.purchase_revenue ?? g.revenue) + (a.purchase_revenue ?? a.revenue),
      new_subs: newSubs,
      cost_per_sub: newSubs > 0 ? g.adspend_with_vat / newSubs : 0,
      refund_amount: (g.refund_amount || 0) + (a.refund_amount || 0),
      refund_reversed_amount: (g.refund_reversed_amount || 0) + (a.refund_reversed_amount || 0),
      refund_count: (g.refund_count || 0) + (a.refund_count || 0),
      refund_reversed_count: (g.refund_reversed_count || 0) + (a.refund_reversed_count || 0),
      refund_source_amount: (g.refund_source_amount || 0) + (a.refund_source_amount || 0),
      refund_source_reversed_amount: (g.refund_source_reversed_amount || 0) + (a.refund_source_reversed_amount || 0),
      per_app: {
        GrailScan: { revenue: g.revenue, new_subs: g.new_subs },
        AskMed: { revenue: a.revenue, new_subs: a.new_subs },
      },
    };
  });
  // Both apps share billing: evaluate the free tier once against combined MTR.
  const trackedRevenue = daily.reduce((sum, d) => sum + d.revenue - d.refund_amount + d.refund_reversed_amount, 0);
  const rcRate = trackedRevenue > 2500 ? 0.01 : 0;
  for (const d of daily) {
    const net = afterRefunds(d);
    d.revenuecat_cost = rcRate ? net * rcRate : 0;
    d.profit = net - d.apple_cost - d.google_cost - d.adspend_with_vat
      - d.openrouter_cost - d.higgsfield_cost - d.revenuecat_cost;
  }
  // Split each day's profit into GrailScan, AskMed iOS and AskMed Android (Loop 2026-11-12).
  // Meta: ASKMED ANDROID campaigns are Android, every other campaign is iOS; GrailScan has
  // no spend in this ad account. OpenRouter follows each part's share of the day's revenue;
  // AI Ads follow the iOS/Android Meta split. The three profits add up to the day's profit.
  const perPlatform: Record<string, PlatformDay> = {};
  for (const d of daily) {
    const p = parts.get(d.date)!;
    const spend = inputs.metaSpendByDate?.[d.date];
    const spendTotal = (spend?.ios || 0) + (spend?.android || 0);
    // A day without saved Play numbers shows all AskMed money as iOS, so its ad spend stays with it.
    const androidShare = p.known && spendTotal > 0 ? (spend!.android || 0) / spendTotal : 0;
    p.android.meta = d.adspend_with_vat * androidShare;
    p.ios.meta = d.adspend_with_vat - p.android.meta;
    p.android.ai_ads = d.higgsfield_cost * androidShare;
    p.ios.ai_ads = d.higgsfield_cost - p.android.ai_ads;
    const gross = p.grailscan.revenue + p.ios.revenue + p.android.revenue;
    for (const part of [p.grailscan, p.ios, p.android]) {
      part.openrouter = gross > 0 ? d.openrouter_cost * (part.revenue / gross) : 0;
      part.revenuecat = rcRate ? (part.revenue - part.refunds) * rcRate : 0;
    }
    if (gross <= 0) p.ios.openrouter = d.openrouter_cost;
    for (const part of [p.grailscan, p.ios, p.android]) {
      part.profit = part.revenue - part.refunds - part.store_cut - part.meta - part.revenuecat - part.openrouter - part.ai_ads;
    }
    const sources = Object.fromEntries(ANDROID_SOURCES.map(source => [source, 0])) as Record<AndroidSource, number>;
    for (const [userId, amount] of Object.entries(p.userRevenue)) {
      sources[androidSourceGroup(inputs.foundViaByUser?.[userId])] += amount;
    }
    perPlatform[d.date] = { grailscan: p.grailscan, ios: p.ios, android: { ...p.android, sources }, android_known: p.known };
  }
  // Blended 30-day share Apple keeps, for labels and older clients.
  const net30 = daily.reduce((sum, d) => sum + afterRefunds(d), 0);
  const blendedAppleRate = net30 > 0 ? daily.reduce((sum, d) => sum + d.apple_cost + d.google_cost, 0) / net30 : appleRate;
  const perApp = { GrailScan: grail.per_app.GrailScan, AskMed: askmed.per_app.AskMed };
  const totalRevenue = perApp.GrailScan.today_revenue + perApp.AskMed.today_revenue;
  const newRevenue = perApp.GrailScan.new_revenue + perApp.AskMed.new_revenue;
  const newSubs = perApp.GrailScan.new_subs + perApp.AskMed.new_subs;
  const today = daily.find(d => d.date === grail.today_vn);
  if (!today) throw new Error("Today's combined chart point is missing");
  const netOf = (key: "today_revenue" | "new_revenue") =>
    perApp.GrailScan[key] * keptFor("GrailScan", grail.today_vn) + perApp.AskMed[key] * keptFor("AskMed", grail.today_vn);
  return {
    reconciliation_warning: [grail.reconciliation_warning, askmed.reconciliation_warning].filter(Boolean).join(" ") || null,
    today_vn: grail.today_vn,
    per_app: perApp,
    transactions: [
      ...grail.transactions.filter(t => t.app === "GrailScan"),
      ...askmed.transactions.filter(t => t.app === "AskMed"),
    ].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)),
    ads: grail.ads,
    daily: daily.map(d => ({ ...d, per_platform: perPlatform[d.date] })),
    profit: {
      ...grail.profit,
      total_revenue: totalRevenue,
      new_revenue: newRevenue,
      new_subs: newSubs,
      apple_commission_rate: blendedAppleRate,
      net_revenue: netOf("today_revenue"),
      net_new_revenue: netOf("new_revenue"),
      total_profit: today.profit,
      new_profit: netOf("new_revenue") - grail.profit.adspend_with_vat,
      cost_per_new_sub: newSubs > 0 ? grail.profit.adspend_with_vat / newSubs : 0,
      daily_refund_cost: today.refund_amount - today.refund_reversed_amount,
    },
  };
}
