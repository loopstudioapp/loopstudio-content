import { supabase } from "@/lib/supabase";
import type { TodayStatsResponse } from "@/app/api/revenuecat/route";

export type ReconciledDay = {
  date: string;
  revenue: number;
  new_subs: number;
  refund_source_amount: number;
  refund_count: number;
  refund_source_reversed_amount: number;
  refund_reversed_count: number;
  // Only the nightly GrailScan job closes the shared Meta cost for yesterday.
  // Omit on provider failures and on historical revenue-only repairs.
  adspend_with_vat?: number;
};
type Run = {
  status: "running" | "complete" | "failed";
  dates: string[];
  started_at: string;
  finished_at?: string;
};
const prefix = "__rc_reconciled_day__";
const runId = (app: string) => `__rc_reconciliation_run__:${app}`;
const dayId = (app: string, date: string) => `${prefix}:${app}:${date}`;
const record = (id: string, value: unknown, stamp: string) => ({
  id, category: "system", title_template: "RevenueCat reconciliation",
  description_template: JSON.stringify(value), prompt_seed: stamp, times_used: 0,
});

export function previousVnDates(days: number, now = new Date()): string[] {
  const localDay = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const midnight = Date.parse(`${localDay}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(midnight - (days - i) * 86400000).toISOString().slice(0, 10));
}

export async function beginReconciliation(app: string, dates: string[]): Promise<Run | null> {
  const { data, error } = await supabase.from("pinterest_topics")
    .select("description_template,prompt_seed").eq("id", runId(app)).maybeSingle();
  if (error) throw new Error("Cannot read reconciliation status");
  const previous: Run | null = data ? JSON.parse(data.description_template) : null;
  if (previous?.status === "complete" && dates.every(date => previous.dates.includes(date))) return null;
  if (previous?.status === "running" && Date.now() - Date.parse(previous.started_at) < 10 * 60000) {
    throw new Error("Reconciliation already running");
  }
  const run: Run = { status: "running", dates, started_at: new Date().toISOString() };
  const row = record(runId(app), run, run.started_at);
  // Compare-and-set prevents duplicate cron invocations from starting two scans.
  if (data) {
    const result = await supabase.from("pinterest_topics").update(row)
      .eq("id", runId(app)).eq("prompt_seed", data.prompt_seed).select("id");
    if (result.error || result.data?.length !== 1) throw new Error("Reconciliation already running");
  } else {
    const result = await supabase.from("pinterest_topics").insert(row);
    if (result.error) throw new Error("Cannot start reconciliation");
  }
  return run;
}

export async function finishReconciliation(app: string, run: Run, days: ReconciledDay[] | null) {
  const stamp = new Date().toISOString();
  if (days && (days.length !== run.dates.length || run.dates.some(date => !days.some(day => day.date === date)))) {
    throw new Error("Incomplete reconciliation: previous values preserved");
  }
  // One atomic statement publishes the complete batch and success marker together.
  // Failure updates only status: never erase or partially replace saved financials.
  const rows = (days || []).map(day => record(dayId(app, day.date), day, stamp));
  rows.push(record(runId(app), { ...run, status: days ? "complete" : "failed", finished_at: stamp }, stamp));
  const { error } = await supabase.from("pinterest_topics").upsert(rows, { onConflict: "id" });
  if (error) throw new Error("Cannot save reconciliation; previous values preserved");
}

export function overlayReconciledDays(data: TodayStatsResponse, corrections: ReconciledDay[]): TodayStatsResponse {
  const byDate = new Map(corrections.map(day => [day.date, day]));
  const daily = data.daily.map(day => {
    const correction = day.date < data.today_vn ? byDate.get(day.date) : undefined;
    return correction ? { ...day, ...correction, purchase_revenue: correction.revenue } : { ...day };
  });
  if (!daily.length) return data;
  const refunds = daily.reduce((sum, day) => sum + (day.refund_source_amount ?? day.refund_amount ?? 0), 0) / daily.length;
  const reversed = daily.reduce((sum, day) => sum + (day.refund_source_reversed_amount ?? day.refund_reversed_amount ?? 0), 0) / daily.length;
  const rcRate = daily.reduce((sum, day) => sum + day.revenue - refunds + reversed, 0) > 2500 ? 0.01 : 0;
  for (const day of daily) {
    const net = day.revenue - refunds + reversed;
    day.refund_amount = refunds;
    day.refund_reversed_amount = reversed;
    day.revenuecat_cost = net * rcRate;
    day.cost_per_sub = day.new_subs ? day.adspend_with_vat / day.new_subs : 0;
    day.profit = net * (1 - data.profit.apple_commission_rate) - day.adspend_with_vat
      - day.openrouter_cost - day.higgsfield_cost - day.revenuecat_cost;
  }
  const today = daily.find(day => day.date === data.today_vn);
  return { ...data, daily, profit: { ...data.profit,
    total_profit: today?.profit ?? data.profit.total_profit,
    daily_refund_cost: refunds - reversed,
  } };
}

export async function withReconciliation(data: TodayStatsResponse, app?: string) {
  if (app !== "GrailScan" && app !== "AskMed") return data;
  const ids = [...data.daily.map(day => dayId(app, day.date)), runId(app)];
  const result = await supabase.from("pinterest_topics")
    .select("id,description_template,prompt_seed").in("id", ids);
  if (result.error) return { ...data, reconciliation_warning: `${app}: revenue reconciliation status unavailable. Showing saved data.` };
  try {
    const corrections: ReconciledDay[] = [];
    let run: Run | null = null;
    let updatedAt: string | null = null;
    for (const row of result.data || []) {
      if (row.id === runId(app)) run = JSON.parse(row.description_template);
      else {
        corrections.push(JSON.parse(row.description_template));
        if (!updatedAt || row.prompt_seed > updatedAt) updatedAt = row.prompt_seed;
      }
    }
    const yesterday = previousVnDates(1)[0];
    // Hobby cron timing can vary within the scheduled hour. Warn after that window.
    const due = Date.now() >= Date.parse(`${data.today_vn}T02:15:00+07:00`);
    const failed = run?.status === "failed" || (run?.status === "running" && Date.now() - Date.parse(run.started_at) > 10 * 60000);
    const missing = due && !corrections.some(day => day.date === yesterday);
    return { ...overlayReconciledDays(data, corrections),
      reconciliation_warning: failed || missing ? `${app}: nightly revenue check is incomplete. Showing the last saved totals.` : null,
      reconciliation: { status: run?.status ?? "pending", updated_at: updatedAt, dates: corrections.map(day => day.date) },
    };
  } catch {
    return { ...data, reconciliation_warning: `${app}: revenue reconciliation data unavailable. Showing saved data.` };
  }
}
