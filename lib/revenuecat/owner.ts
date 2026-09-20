import type { DailyPoint, TodayStatsResponse } from "@/app/api/revenuecat/route";

export const OWNER_APPS = ["GrailScan", "AskMed"] as const;
export type OwnerApp = (typeof OWNER_APPS)[number];
export type AppBreakdown = Record<OwnerApp, { revenue: number; new_subs: number }>;

/** Combine app ledgers, not their profits: the provider ledger is shared. */
export function combineOwnerStats(grail: TodayStatsResponse, askmed: TodayStatsResponse) {
  if (grail.today_vn !== askmed.today_vn || !grail.per_app.GrailScan || !askmed.per_app.AskMed) {
    throw new Error("Both app snapshots must cover the same reporting day");
  }
  const askDays = new Map(askmed.daily.map(day => [day.date, day]));
  if (grail.daily.length !== askmed.daily.length || grail.daily.some(day => !askDays.has(day.date))) {
    throw new Error("Both apps must have a complete matching daily history");
  }
  const appleRate = grail.profit.apple_commission_rate;
  const daily = grail.daily.map((g): DailyPoint & { per_app: AppBreakdown } => {
    const a = askDays.get(g.date)!;
    const revenue = g.revenue + a.revenue;
    const newSubs = g.new_subs + a.new_subs;
    return {
      ...g,
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
    const afterRefunds = d.revenue - d.refund_amount + d.refund_reversed_amount;
    d.revenuecat_cost = rcRate ? afterRefunds * rcRate : 0;
    d.profit = afterRefunds * (1 - appleRate) - d.adspend_with_vat
      - d.openrouter_cost - d.higgsfield_cost - d.revenuecat_cost;
  }
  const perApp = { GrailScan: grail.per_app.GrailScan, AskMed: askmed.per_app.AskMed };
  const totalRevenue = perApp.GrailScan.today_revenue + perApp.AskMed.today_revenue;
  const newRevenue = perApp.GrailScan.new_revenue + perApp.AskMed.new_revenue;
  const newSubs = perApp.GrailScan.new_subs + perApp.AskMed.new_subs;
  const today = daily.find(d => d.date === grail.today_vn);
  if (!today) throw new Error("Today's combined chart point is missing");
  return {
    today_vn: grail.today_vn,
    per_app: perApp,
    transactions: [
      ...grail.transactions.filter(t => t.app === "GrailScan"),
      ...askmed.transactions.filter(t => t.app === "AskMed"),
    ].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)),
    ads: grail.ads,
    daily,
    profit: {
      ...grail.profit,
      total_revenue: totalRevenue,
      new_revenue: newRevenue,
      new_subs: newSubs,
      net_revenue: totalRevenue * (1 - appleRate),
      net_new_revenue: newRevenue * (1 - appleRate),
      total_profit: today.profit,
      new_profit: newRevenue * (1 - appleRate) - grail.profit.adspend_with_vat,
      cost_per_new_sub: newSubs > 0 ? grail.profit.adspend_with_vat / newSubs : 0,
      daily_refund_cost: today.refund_amount - today.refund_reversed_amount,
    },
  };
}
