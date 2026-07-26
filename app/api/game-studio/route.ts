import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CACHE_KEY = "__game_studio_cache__";
const ACTOR_ID = "apify~facebook-posts-scraper";
const REFRESH_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const REUSABLE_RUN_MAX_AGE_MS = 60 * 60 * 1000;
const POST_WINDOW_MS = 24 * 60 * 60 * 1000;
const RESULTS_LIMIT = 25;

const PAGE_CONFIG = [
  {
    key: "vltk3d",
    label: "Võ Lâm Tình Kiếm 3D",
    url: "https://www.facebook.com/vltk3d.vn",
  },
  {
    key: "tlbbm",
    label: "Tân Thiên Long Mobile",
    url: "https://www.facebook.com/tlbbm.cmplay",
  },
  {
    key: "vtcm",
    label: "Võ Tướng Chiến Mobile",
    url: "https://www.facebook.com/vtcm.cmplay",
  },
  {
    key: "mongchiton",
    label: "Võ Lâm Chi Mộng",
    url: "https://www.facebook.com/mongchiton.vn",
  },
] as const;

type ApifyPost = {
  postId?: string;
  pageName?: string;
  inputUrl?: string;
  facebookUrl?: string;
  url?: string;
  topLevelUrl?: string;
  time?: string;
  timestamp?: number;
  createdAt?: string;
  text?: string;
  message?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  topReactionsCount?: number;
  user?: { name?: string };
};

type GameStudioPost = {
  id: string;
  text: string;
  url: string;
  created_at: string;
  likes: number;
  comments: number;
  shares: number;
};

type GameStudioPage = {
  key: string;
  name: string;
  url: string;
  summary: string;
  posts: GameStudioPost[];
};

type GameStudioData = {
  generated_at: string;
  window_start: string;
  overall_summary: string;
  total_posts: number;
  pages: GameStudioPage[];
  apify_run_reused?: boolean;
};

type CachedGameStudioData = {
  data: GameStudioData;
  updatedAt: string;
};

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "").toLowerCase();
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function refreshAuthorized(request: NextRequest): boolean {
  const cookie = request.headers.get("cookie") || "";
  if (/(?:^|;\s*)(admin|employee_id)=/.test(cookie)) return true;

  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  return Boolean(cronSecret && authorization === `Bearer ${cronSecret}`);
}

async function readCache(): Promise<CachedGameStudioData | null> {
  const { data } = await supabase
    .from("pinterest_topics")
    .select("description_template, prompt_seed")
    .eq("id", CACHE_KEY)
    .single();

  if (!data?.description_template || !data.prompt_seed) return null;

  try {
    return {
      data: JSON.parse(data.description_template) as GameStudioData,
      updatedAt: data.prompt_seed,
    };
  } catch {
    return null;
  }
}

async function writeCache(data: GameStudioData): Promise<void> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from("pinterest_topics").upsert(
    {
      id: CACHE_KEY,
      category: "system",
      title_template: "Game Studio Facebook Cache",
      description_template: JSON.stringify(data),
      prompt_seed: updatedAt,
      times_used: 0,
      last_used_at: updatedAt,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Could not save Game Studio cache: ${error.message}`);
}

function actorInput() {
  return {
    startUrls: PAGE_CONFIG.map((page) => ({ url: page.url })),
    resultsLimit: RESULTS_LIMIT,
    onlyPostsNewerThan: "1 day",
    captionText: false,
  };
}

async function apifyFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not configured");

  return fetch(`https://api.apify.com/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    cache: "no-store",
  });
}

function matchesConfiguredInput(input: {
  startUrls?: Array<{ url?: string }>;
  onlyPostsNewerThan?: string;
}): boolean {
  if (input.onlyPostsNewerThan !== "1 day") return false;
  const expected = PAGE_CONFIG.map((page) => normalizeUrl(page.url)).sort();
  const actual = (input.startUrls || [])
    .map((entry) => normalizeUrl(entry.url || ""))
    .filter(Boolean)
    .sort();
  return expected.length === actual.length && expected.every((url, index) => url === actual[index]);
}

async function reuseRecentActorRun(): Promise<ApifyPost[] | null> {
  const runResponse = await apifyFetch(`/acts/${ACTOR_ID}/runs/last?status=SUCCEEDED`);
  if (!runResponse.ok) return null;
  const run = (await runResponse.json())?.data;
  const finishedAt = new Date(run?.finishedAt || 0).getTime();
  if (
    !run?.defaultDatasetId ||
    !run?.defaultKeyValueStoreId ||
    !Number.isFinite(finishedAt) ||
    Date.now() - finishedAt > REUSABLE_RUN_MAX_AGE_MS
  ) {
    return null;
  }

  const inputResponse = await apifyFetch(
    `/key-value-stores/${encodeURIComponent(run.defaultKeyValueStoreId)}/records/INPUT`
  );
  if (!inputResponse.ok || !matchesConfiguredInput(await inputResponse.json())) return null;

  const itemsResponse = await apifyFetch(
    `/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?format=json&clean=true`
  );
  if (!itemsResponse.ok) return null;
  return (await itemsResponse.json()) as ApifyPost[];
}

async function runFacebookScraper(): Promise<{ posts: ApifyPost[]; reused: boolean }> {
  const reusable = await reuseRecentActorRun();
  if (reusable) return { posts: reusable, reused: true };

  const response = await apifyFetch(
    `/acts/${ACTOR_ID}/run-sync-get-dataset-items?format=json&clean=true&timeout=300`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actorInput()),
    }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Facebook scraper failed (${response.status}): ${text.slice(0, 240)}`);
  }
  return { posts: JSON.parse(text) as ApifyPost[], reused: false };
}

function postTime(post: ApifyPost): number | null {
  const raw = post.time || post.createdAt;
  const parsed = raw ? new Date(raw).getTime() : number(post.timestamp) * 1000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizePosts(posts: ApifyPost[]): GameStudioPage[] {
  const cutoff = Date.now() - POST_WINDOW_MS;

  return PAGE_CONFIG.map((config) => {
    const matching = posts.filter((post) => {
      const source = normalizeUrl(post.inputUrl || post.facebookUrl || "");
      const createdAt = postTime(post);
      return source === normalizeUrl(config.url) && createdAt != null && createdAt >= cutoff;
    });

    const seen = new Set<string>();
    const normalized = matching
      .map((post): GameStudioPost | null => {
        const createdAt = postTime(post);
        if (createdAt == null) return null;
        const url = post.url || post.topLevelUrl || config.url;
        const id = post.postId || url;
        if (seen.has(id)) return null;
        seen.add(id);
        return {
          id,
          text: String(post.text || post.message || "").trim(),
          url,
          created_at: new Date(createdAt).toISOString(),
          likes: number(post.likes ?? post.topReactionsCount),
          comments: number(post.comments),
          shares: number(post.shares),
        };
      })
      .filter((post): post is GameStudioPost => post != null)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const actorName =
      matching.find((post) => post.user?.name)?.user?.name ||
      matching.find((post) => post.pageName)?.pageName ||
      config.label;

    return {
      key: config.key,
      name: actorName,
      url: config.url,
      summary: "",
      posts: normalized,
    };
  });
}

function fallbackSummary(pages: GameStudioPage[]) {
  const activePages = pages.filter((page) => page.posts.length > 0);
  const total = pages.reduce((sum, page) => sum + page.posts.length, 0);
  return {
    overall:
      total > 0
        ? `${activePages.length} of ${pages.length} pages published ${total} posts in the last 24 hours.`
        : "No new posts were found across the monitored pages in the last 24 hours.",
    pages: Object.fromEntries(
      pages.map((page) => [
        page.key,
        page.posts.length > 0
          ? `${page.posts.length} new posts in the last 24 hours.`
          : "No new posts in the last 24 hours.",
      ])
    ) as Record<string, string>,
  };
}

async function summarizePages(pages: GameStudioPage[]) {
  const fallback = fallbackSummary(pages);
  const apiKey = process.env.OPENAI_API_KEY;
  const totalPosts = pages.reduce((sum, page) => sum + page.posts.length, 0);
  if (!apiKey || totalPosts === 0) return fallback;

  const compact = pages.map((page) => ({
    key: page.key,
    name: page.name,
    posts: page.posts.map((post) => ({
      time: post.created_at,
      text: post.text.slice(0, 1_500),
    })),
  }));

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You summarize Vietnamese mobile game Facebook activity for an operator dashboard. " +
            "Return concise Vietnamese JSON with exactly this shape: " +
            '{"overall":"1-2 sentence cross-page summary","pages":{"page_key":"1-2 sentence factual summary"}}. ' +
            "Mention launches, servers, events, promotions, updates, and deadlines. Do not invent details.",
        },
        {
          role: "user",
          content: JSON.stringify(compact),
        },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}") as {
      overall?: string;
      pages?: Record<string, string>;
    };
    return {
      overall: parsed.overall || fallback.overall,
      pages: { ...fallback.pages, ...(parsed.pages || {}) },
    };
  } catch {
    return fallback;
  }
}

function postSet(data: GameStudioData | null): string {
  return (data?.pages || [])
    .flatMap((page) => page.posts.map((post) => post.id))
    .sort()
    .join("|");
}

async function refreshData(cached: CachedGameStudioData | null): Promise<GameStudioData> {
  const scraped = await runFacebookScraper();
  const pages = normalizePosts(scraped.posts);
  const draft: GameStudioData = {
    generated_at: new Date().toISOString(),
    window_start: new Date(Date.now() - POST_WINDOW_MS).toISOString(),
    overall_summary: "",
    total_posts: pages.reduce((sum, page) => sum + page.posts.length, 0),
    pages,
    apify_run_reused: scraped.reused,
  };

  const summaries =
    cached && postSet(cached.data) === postSet(draft)
      ? {
          overall: cached.data.overall_summary,
          pages: Object.fromEntries(cached.data.pages.map((page) => [page.key, page.summary])),
        }
      : await summarizePages(pages);

  draft.overall_summary = summaries.overall;
  draft.pages = pages.map((page) => ({
    ...page,
    summary: summaries.pages[page.key] || fallbackSummary([page]).pages[page.key],
  }));
  await writeCache(draft);
  return draft;
}

function responseFor(data: GameStudioData, updatedAt: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({
    ok: true,
    data,
    updated_at: updatedAt,
    next_refresh_at: new Date(new Date(updatedAt).getTime() + REFRESH_COOLDOWN_MS).toISOString(),
    ...extra,
  });
}

async function handleRefresh(request: NextRequest) {
  if (!refreshAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const cached = await readCache();
  if (cached) {
    const cacheAge = Date.now() - new Date(cached.updatedAt).getTime();
    if (cacheAge < REFRESH_COOLDOWN_MS) {
      return responseFor(cached.data, cached.updatedAt, {
        cached: true,
        refresh_skipped: true,
      });
    }
  }

  try {
    const data = await refreshData(cached);
    return responseFor(data, data.generated_at, {
      cached: false,
      refresh_skipped: false,
    });
  } catch (error) {
    if (cached) {
      return responseFor(cached.data, cached.updatedAt, {
        cached: true,
        stale: true,
        refresh_error: error instanceof Error ? error.message : "Refresh failed",
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Game Studio refresh failed",
      },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("refresh") === "1") {
    return handleRefresh(request);
  }

  const cached = await readCache();
  if (!cached) {
    return NextResponse.json({
      ok: true,
      data: null,
      cached: false,
      message: "Game Studio has not been refreshed yet.",
    });
  }
  return responseFor(cached.data, cached.updatedAt, { cached: true });
}

export async function POST(request: NextRequest) {
  return handleRefresh(request);
}
