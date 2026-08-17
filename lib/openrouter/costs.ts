import { supabase } from "@/lib/supabase";

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

function cacheId(appName: string, date: string): string {
  return `${OPENROUTER_CACHE_PREFIX}:${appName}:${date}`;
}

function managementHeaders(): { Authorization: string } {
  const managementKey = process.env.OPENROUTER_MANAGEMENT_API_KEY;
  if (!managementKey) throw new Error("OpenRouter management API is not configured");
  return { Authorization: `Bearer ${managementKey}` };
}

async function fetchMatchingKeys(): Promise<OpenRouterKey[]> {
  const keyName = process.env.OPENROUTER_GRAILSCAN_KEY_NAME || "Sports Card Scanner";
  const response = await fetch(OPENROUTER_KEYS_URL, {
    headers: managementHeaders(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OpenRouter key query failed: ${response.status}`);

  const json = (await response.json()) as { data?: OpenRouterKey[] };
  const matchingKeys = (json.data || []).filter((key) => key.name === keyName && key.hash);
  if (matchingKeys.length === 0) throw new Error(`OpenRouter key not found: ${keyName}`);
  return matchingKeys;
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
    const { error } = await supabase.from("pinterest_topics").upsert(rows, { onConflict: "id" });
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
  const { data, error } = await supabase
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
  const keys = await fetchMatchingKeys();
  const currentCost = keys.reduce((sum, key) => {
    const cost = Number(key.usage_daily || 0);
    return Number.isFinite(cost) ? sum + cost : sum;
  }, 0);
  const costsByDate = { [currentUtcDate]: currentCost };
  const updatedAt = await writeOpenRouterDailyCosts(appName, costsByDate);
  return { costsByDate, updatedAt };
}

export async function reconcileOpenRouterDailyCosts(
  dates: string[],
  appName = "GrailScan"
): Promise<OpenRouterCostCache> {
  const keys = await fetchMatchingKeys();
  const currentUtcDate = new Date().toISOString().slice(0, 10);
  const requestedDates = new Set(dates);
  const costsByDate = Object.fromEntries(dates.map((date) => [date, 0]));

  const activityResponses = await Promise.all(
    keys.map(async (key) => {
      const url = new URL(OPENROUTER_ACTIVITY_URL);
      url.searchParams.set("api_key_hash", key.hash!);
      const response = await fetch(url, { headers: managementHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error(`OpenRouter activity query failed: ${response.status}`);
      const json = (await response.json()) as { data?: OpenRouterActivity[] };
      return json.data || [];
    })
  );

  for (const point of activityResponses.flat()) {
    const date = point.date?.slice(0, 10);
    const cost = Number(point.usage || 0);
    if (date && date !== currentUtcDate && requestedDates.has(date) && Number.isFinite(cost)) {
      costsByDate[date] += cost;
    }
  }

  if (requestedDates.has(currentUtcDate)) {
    costsByDate[currentUtcDate] = keys.reduce((sum, key) => {
      const cost = Number(key.usage_daily || 0);
      return Number.isFinite(cost) ? sum + cost : sum;
    }, 0);
  }

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
