import { db } from "@/lib/db";

const OPENROUTER_CACHE_PREFIX = "__openrouter_daily_cost__";
const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/keys";
const OPENROUTER_ACTIVITY_URL = "https://openrouter.ai/api/v1/activity";

type OpenRouterKey = {
  name?: string;
  hash?: string;
  usage_daily?: number | string | null;
};

type OpenRouterActivity = {
  date?: string;
  usage?: number | string | null;
};

export type OpenRouterCostCache = {
  costsByDate: Record<string, number>;
  updatedAt: string | null;
};

const OPENROUTER_ERROR_PREFIX = "__openrouter_last_error__";

export type OpenRouterError = { message: string; at: string };

/** Saves why the last OpenRouter lookup failed (status/message only, never a key). Never throws. */
export async function saveOpenRouterError(appName: string, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  try {
    await db.from("pinterest_topics").upsert([{
      id: `${OPENROUTER_ERROR_PREFIX}:${appName}`,
      category: "system",
      title_template: `OpenRouter last error ${appName}`,
      description_template: message,
      prompt_seed: new Date().toISOString(),
      times_used: 0,
    }], { onConflict: "id" });
  } catch {
    // Recording the error must never break the dashboard.
  }
}

export async function readOpenRouterError(appName: string): Promise<OpenRouterError | null> {
  const { data, error } = await db
    .from("pinterest_topics")
    .select("description_template, prompt_seed")
    .eq("id", `${OPENROUTER_ERROR_PREFIX}:${appName}`)
    .maybeSingle();
  if (error || !data) return null;
  return { message: data.description_template, at: data.prompt_seed };
}

function cacheId(appName: string, date: string): string {
  return `${OPENROUTER_CACHE_PREFIX}:${appName}:${date}`;
}

function managementHeaders(): { Authorization: string } {
  const managementKey = process.env.OPENROUTER_MANAGEMENT_API_KEY;
  if (!managementKey) throw new Error("OpenRouter management API is not configured");
  return { Authorization: `Bearer ${managementKey}` };
}

// Every key on the OpenRouter account (AskMed, GrailScan, the old AskMed 1.0
// key and any other app): the owner card shows the whole OpenRouter bill.
async function fetchAllKeys(): Promise<OpenRouterKey[]> {
  const response = await fetch(OPENROUTER_KEYS_URL, {
    headers: managementHeaders(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OpenRouter key query failed: ${response.status}`);

  const json = (await response.json()) as { data?: OpenRouterKey[] };
  return json.data || [];
}

function usageTodayAllKeys(keys: OpenRouterKey[]): number {
  return keys.reduce((sum, key) => {
    const cost = Number(key.usage_daily || 0);
    return Number.isFinite(cost) ? sum + cost : sum;
  }, 0);
}

async function writeOpenRouterDailyCosts(
  appName: string,
  costsByDate: Record<string, number>
): Promise<string> {
  const updatedAt = new Date().toISOString();
  const rows = Object.entries(costsByDate).map(([date, cost]) => ({
    id: cacheId(appName, date),
    category: "system",
    title_template: `OpenRouter daily cost ${appName}`,
    description_template: String(cost),
    prompt_seed: updatedAt,
    times_used: 0,
  }));

  if (rows.length > 0) {
    const { error } = await db.from("pinterest_topics").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`OpenRouter cache write failed: ${error.message}`);
  }
  return updatedAt;
}

export async function readOpenRouterDailyCosts(
  appName: string,
  dates: string[]
): Promise<OpenRouterCostCache> {
  if (dates.length === 0) return { costsByDate: {}, updatedAt: null };

  const ids = dates.map((date) => cacheId(appName, date));
  const { data, error } = await db
    .from("pinterest_topics")
    .select("id, description_template, prompt_seed")
    .in("id", ids);
  if (error) throw new Error(`OpenRouter cache read failed: ${error.message}`);

  const dateById = new Map(dates.map((date) => [cacheId(appName, date), date]));
  const costsByDate: Record<string, number> = {};
  let updatedAt: string | null = null;
  for (const row of data || []) {
    const date = dateById.get(row.id);
    const cost = Number(row.description_template);
    if (date && Number.isFinite(cost)) costsByDate[date] = cost;
    if (row.prompt_seed && (!updatedAt || row.prompt_seed > updatedAt)) updatedAt = row.prompt_seed;
  }
  return { costsByDate, updatedAt };
}

export async function refreshOpenRouterCurrentCost(
  appName = "GrailScan"
): Promise<OpenRouterCostCache> {
  const currentUtcDate = new Date().toISOString().slice(0, 10);
  const currentCost = usageTodayAllKeys(await fetchAllKeys());
  const costsByDate = { [currentUtcDate]: currentCost };
  const updatedAt = await writeOpenRouterDailyCosts(appName, costsByDate);
  return { costsByDate, updatedAt };
}

export async function reconcileOpenRouterDailyCosts(
  dates: string[],
  appName = "GrailScan"
): Promise<OpenRouterCostCache> {
  const keys = await fetchAllKeys();
  const currentUtcDate = new Date().toISOString().slice(0, 10);
  const requestedDates = new Set(dates);
  const costsByDate = Object.fromEntries(dates.map((date) => [date, 0]));

  // Account-wide activity (no api_key_hash): every key, last 30 completed UTC days.
  const response = await fetch(OPENROUTER_ACTIVITY_URL, { headers: managementHeaders(), cache: "no-store" });
  if (!response.ok) throw new Error(`OpenRouter activity query failed: ${response.status}`);
  const activity = ((await response.json()) as { data?: OpenRouterActivity[] }).data || [];

  for (const point of activity) {
    const date = point.date?.slice(0, 10);
    const cost = Number(point.usage || 0);
    if (date && date !== currentUtcDate && requestedDates.has(date) && Number.isFinite(cost)) {
      costsByDate[date] += cost;
    }
  }

  if (requestedDates.has(currentUtcDate)) costsByDate[currentUtcDate] = usageTodayAllKeys(keys);

  // Write only after every source request succeeds. A partial OpenRouter outage
  // therefore leaves the last complete reconciliation untouched.
  const updatedAt = await writeOpenRouterDailyCosts(appName, costsByDate);
  return { costsByDate, updatedAt };
}

export function utcDateWindow(days = 30, endDate = new Date()): string[] {
  const end = new Date(Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate()
  ));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}
