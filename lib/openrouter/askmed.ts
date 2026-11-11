import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@/lib/db";

// AskMed's real OpenRouter bill. The askmed-api Worker saves its own key's
// usage (GET /api/v1/key) every 10 minutes into its D1 database `askmed-qa`,
// table `openrouter_key_usage` (askmed repo, Server/src/keyUsage.ts). This
// dashboard only reads that table (binding ASKMED_DB); it never writes to it
// and needs no OpenRouter key of its own.

export type UsageDay = { day: string; usage: number };

/**
 * Cost per UTC date = the key's all-time usage at the end of that date minus
 * the usage at the end of the last earlier date that has a snapshot. A date
 * without a snapshot gets 0 and its spend lands on the next saved date. The
 * first date needs an earlier baseline, so it is skipped when none exists.
 */
export function dailyCostsFromUsage(rows: UsageDay[], dates: string[]): Record<string, number> {
  const wanted = new Set(dates);
  const costs: Record<string, number> = {};
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  for (let i = 1; i < sorted.length; i++) {
    const { day, usage } = sorted[i];
    if (!wanted.has(day)) continue;
    // A replaced key starts again from 0; never count a negative cost.
    costs[day] = Math.max(0, usage - sorted[i - 1].usage);
  }
  return costs;
}

export async function readAskMedOpenRouterDailyCosts(dates: string[]): Promise<Record<string, number>> {
  if (dates.length === 0) return {};
  const env = getCloudflareContext().env as unknown as { ASKMED_DB?: D1Database };
  if (!env.ASKMED_DB) throw new Error("D1 binding ASKMED_DB is not configured");
  // Look back a week before the first date for the baseline snapshot.
  const lookback = new Date(`${[...dates].sort()[0]}T00:00:00Z`);
  lookback.setUTCDate(lookback.getUTCDate() - 7);
  const result = await env.ASKMED_DB.prepare(
    `SELECT substr(taken_at, 1, 10) AS day, MAX(usage) AS usage
       FROM openrouter_key_usage
      WHERE taken_at >= ?1 AND usage IS NOT NULL
      GROUP BY day ORDER BY day`
  ).bind(lookback.toISOString()).all();
  const rows = (result.results || [])
    .map((row) => ({ day: String(row.day), usage: Number(row.usage) }))
    .filter((row) => Number.isFinite(row.usage));
  return dailyCostsFromUsage(rows, dates);
}
