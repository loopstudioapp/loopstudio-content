import { getCloudflareContext } from "@opennextjs/cloudflare";
import { db } from "@/lib/db";
import { getMetaSpendByPlatformDay, type PlatformSpend } from "@/lib/meta/ads";

// Inputs for the owner page's GrailScan / AskMed iOS / AskMed Android split (Loop 2026-11-12).

const SPEND_CACHE_ID = "__meta_platform_spend__";
const SPEND_MAX_AGE_MS = 30 * 60 * 1000;
type SpendCache = { days: Record<string, PlatformSpend>; updated_at: string };

/**
 * Meta spend per Vietnam day split by campaign (ASKMED ANDROID → Android, others → iOS).
 * Read-only Graph GET, saved for 30 minutes; a Meta failure keeps the last saved split.
 */
export async function loadMetaSpendByPlatform(dates: string[], forceFresh = false): Promise<Record<string, PlatformSpend>> {
  let saved: SpendCache | null = null;
  try {
    const { data } = await db.from("pinterest_topics").select("description_template").eq("id", SPEND_CACHE_ID).maybeSingle();
    if (data?.description_template) saved = JSON.parse(data.description_template) as SpendCache;
  } catch {
    saved = null;
  }
  const fresh = saved && Date.now() - Date.parse(saved.updated_at) < SPEND_MAX_AGE_MS;
  if (saved && fresh && !forceFresh && dates.every(date => date in saved!.days || date === dates.at(-1))) return saved.days;

  const fetched = dates.length ? await getMetaSpendByPlatformDay(dates[0], dates.at(-1)!) : null;
  if (!fetched) return saved?.days || {};
  // Days Meta returns no rows for had no spend.
  const days: Record<string, PlatformSpend> = {};
  for (const date of dates) days[date] = fetched[date] || { ios: 0, android: 0 };
  const value: SpendCache = { days, updated_at: new Date().toISOString() };
  await db.from("pinterest_topics").upsert({
    id: SPEND_CACHE_ID, category: "system", title_template: "Meta spend by platform",
    description_template: JSON.stringify(value), prompt_seed: value.updated_at, times_used: 0,
  }, { onConflict: "id" });
  return days;
}

type AskMedDb = { prepare(sql: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results?: T[] }> } } };

/**
 * "How did you find AskMed?" answers for these RevenueCat app user ids, read-only from
 * AskMed's own D1 (askmed-qa, binding ASKMED_DB). Debug builds are left out.
 * Returns null when the database can't be read.
 */
export async function loadFoundVia(userIds: string[]): Promise<Record<string, string> | null> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return {};
  let database: AskMedDb | undefined;
  try {
    database = (getCloudflareContext().env as unknown as { ASKMED_DB?: AskMedDb }).ASKMED_DB;
  } catch {
    database = undefined;
  }
  if (!database) return null;
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const { results } = await database
        .prepare(`SELECT app_user_id, answer FROM onboarding_answers
          WHERE question = 'found_via' AND COALESCE(build, 'release') <> 'debug'
          AND app_user_id IN (${chunk.map(() => "?").join(",")})`)
        .bind(...chunk)
        .all<{ app_user_id: string; answer: string }>();
      for (const row of results || []) {
        try {
          const keys = JSON.parse(row.answer);
          if (Array.isArray(keys) && typeof keys[0] === "string") out[row.app_user_id] = keys[0];
        } catch {
          // A malformed answer counts as no answer (Other).
        }
      }
    }
    return out;
  } catch (error) {
    console.error("AskMed found-via answers unavailable", error instanceof Error ? error.message : error);
    return null;
  }
}
