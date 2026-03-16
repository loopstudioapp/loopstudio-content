import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function scrapeTikTok(handle: string) {
  const resp = await fetch(`https://www.tiktok.com/@${handle}`, {
    headers: { "User-Agent": UA },
  });
  const html = await resp.text();
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/
  );
  if (!match) return null;

  const data = JSON.parse(match[1]);
  const stats =
    data?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo?.stats;
  if (!stats) return null;

  return {
    followers: stats.followerCount ?? 0,
    following: stats.followingCount ?? 0,
    total_likes: stats.heartCount ?? 0,
    posts: stats.videoCount ?? 0,
  };
}

async function scrapeLemon8(handle: string) {
  const resp = await fetch(`https://www.lemon8-app.com/@${handle}`, {
    headers: { "User-Agent": UA },
  });
  const html = await resp.text();

  const scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
  for (const script of scripts) {
    const inner = script.replace(/<\/?script[^>]*>/g, "");
    if (!inner.includes("loaderData")) continue;

    const decoded = decodeURIComponent(inner);
    const data = JSON.parse(decoded);
    const loader = data?.state?.loaderData;
    if (!loader) continue;

    for (const val of Object.values(loader)) {
      if (typeof val !== "object" || val === null) continue;
      const record = val as Record<string, unknown>;
      for (const [k, v] of Object.entries(record)) {
        if (k.startsWith("$UserDetailV2") && typeof v === "object" && v !== null) {
          const user = v as Record<string, number>;
          return {
            lm8_followers: user.followerCount ?? 0,
            lm8_following: user.followingCount ?? 0,
            lm8_total_likes: user.dugCount ?? 0,
            lm8_posts: user.postCount ?? 0,
          };
        }
      }
    }
  }
  return null;
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

function diff(current: number, previous: number | null): string {
  if (previous === null || previous === undefined) return "";
  const d = current - previous;
  if (d === 0) return "";
  return d > 0 ? ` (+${fmt(d)})` : ` (${fmt(d)})`;
}

interface AccountMetrics {
  username: string;
  followers: number;
  total_likes: number;
  posts: number;
  lm8_followers: number;
  lm8_total_likes: number;
  lm8_posts: number;
  prev_followers: number | null;
  prev_total_likes: number | null;
  prev_posts: number | null;
  prev_lm8_followers: number | null;
  prev_lm8_total_likes: number | null;
  prev_lm8_posts: number | null;
}

async function sendTelegramReport(date: string, allMetrics: AccountMetrics[]) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  // Overall totals
  const totals = allMetrics.reduce(
    (acc, m) => ({
      tkFollowers: acc.tkFollowers + m.followers,
      tkLikes: acc.tkLikes + m.total_likes,
      tkPosts: acc.tkPosts + m.posts,
      lmFollowers: acc.lmFollowers + m.lm8_followers,
      lmLikes: acc.lmLikes + m.lm8_total_likes,
      lmPosts: acc.lmPosts + m.lm8_posts,
      prevTkFollowers: acc.prevTkFollowers + (m.prev_followers ?? m.followers),
      prevTkLikes: acc.prevTkLikes + (m.prev_total_likes ?? m.total_likes),
      prevTkPosts: acc.prevTkPosts + (m.prev_posts ?? m.posts),
      prevLmFollowers: acc.prevLmFollowers + (m.prev_lm8_followers ?? m.lm8_followers),
      prevLmLikes: acc.prevLmLikes + (m.prev_lm8_total_likes ?? m.lm8_total_likes),
      prevLmPosts: acc.prevLmPosts + (m.prev_lm8_posts ?? m.lm8_posts),
    }),
    { tkFollowers: 0, tkLikes: 0, tkPosts: 0, lmFollowers: 0, lmLikes: 0, lmPosts: 0, prevTkFollowers: 0, prevTkLikes: 0, prevTkPosts: 0, prevLmFollowers: 0, prevLmLikes: 0, prevLmPosts: 0 }
  );

  let msg = `📊 *Daily Content Report*\n🗓 ${date}\n`;
  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `\n📋 *Overall*\n\n`;
  msg += `🎵 *TikTok*\n`;
  msg += `Followers: ${fmt(totals.tkFollowers)}${diff(totals.tkFollowers, totals.prevTkFollowers)}\n`;
  msg += `Likes: ${fmt(totals.tkLikes)}${diff(totals.tkLikes, totals.prevTkLikes)}\n`;
  msg += `Posts: ${fmt(totals.tkPosts)}${diff(totals.tkPosts, totals.prevTkPosts)}\n\n`;
  msg += `🍋 *Lemon8*\n`;
  msg += `Followers: ${fmt(totals.lmFollowers)}${diff(totals.lmFollowers, totals.prevLmFollowers)}\n`;
  msg += `Likes: ${fmt(totals.lmLikes)}${diff(totals.lmLikes, totals.prevLmLikes)}\n`;
  msg += `Posts: ${fmt(totals.lmPosts)}${diff(totals.lmPosts, totals.prevLmPosts)}\n`;

  for (const m of allMetrics) {
    const handle = m.username.replace(/^@/, "");
    msg += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `🎵 *TikTok* — [${m.username}](https://www.tiktok.com/@${handle})\n\n`;
    msg += `Followers: ${fmt(m.followers)}${diff(m.followers, m.prev_followers)}\n`;
    msg += `Likes: ${fmt(m.total_likes)}${diff(m.total_likes, m.prev_total_likes)}\n`;
    msg += `Posts: ${fmt(m.posts)}${diff(m.posts, m.prev_posts)}\n\n`;
    msg += `🍋 *Lemon8* — [${m.username}](https://www.lemon8-app.com/@${handle})\n\n`;
    msg += `Followers: ${fmt(m.lm8_followers)}${diff(m.lm8_followers, m.prev_lm8_followers)}\n`;
    msg += `Likes: ${fmt(m.lm8_total_likes)}${diff(m.lm8_total_likes, m.prev_lm8_total_likes)}\n`;
    msg += `Posts: ${fmt(m.lm8_posts)}${diff(m.lm8_posts, m.prev_lm8_posts)}\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━`;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: msg,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, username, status")
    .eq("status", "Active");

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ message: "No active accounts" });
  }

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const results: { username: string; tiktok: string; lemon8: string }[] = [];
  const allMetrics: AccountMetrics[] = [];

  // Fetch yesterday's metrics for comparison
  const { data: prevMetrics } = await supabase
    .from("daily_metrics")
    .select("account_id, followers, total_likes, posts, lm8_followers, lm8_total_likes, lm8_posts")
    .eq("date", yesterday);

  const prevMap = new Map(
    (prevMetrics || []).map((m: Record<string, unknown>) => [m.account_id, m])
  );

  for (const acc of accounts) {
    const handle = acc.username.replace(/^@/, "");
    let tkStatus = "skip";
    let lm8Status = "skip";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metrics: Record<string, any> = { account_id: acc.id, date: today };

    // Scrape TikTok
    try {
      const tk = await scrapeTikTok(handle);
      if (tk) { metrics = { ...metrics, ...tk }; tkStatus = "ok"; }
      else tkStatus = "parse_error";
    } catch (e) {
      tkStatus = `error: ${e instanceof Error ? e.message : "unknown"}`;
    }

    await new Promise((r) => setTimeout(r, 500));

    // Scrape Lemon8
    try {
      const lm8 = await scrapeLemon8(handle);
      if (lm8) { metrics = { ...metrics, ...lm8 }; lm8Status = "ok"; }
      else lm8Status = "parse_error";
    } catch (e) {
      lm8Status = `error: ${e instanceof Error ? e.message : "unknown"}`;
    }

    // Upsert combined metrics
    if (tkStatus === "ok" || lm8Status === "ok") {
      await supabase.from("daily_metrics").upsert(metrics, { onConflict: "account_id,date" });
    }

    // Collect for Telegram report
    const prev = prevMap.get(acc.id) as Record<string, number> | undefined;
    allMetrics.push({
      username: acc.username,
      followers: metrics.followers ?? 0,
      total_likes: metrics.total_likes ?? 0,
      posts: metrics.posts ?? 0,
      lm8_followers: metrics.lm8_followers ?? 0,
      lm8_total_likes: metrics.lm8_total_likes ?? 0,
      lm8_posts: metrics.lm8_posts ?? 0,
      prev_followers: prev?.followers ?? null,
      prev_total_likes: prev?.total_likes ?? null,
      prev_posts: prev?.posts ?? null,
      prev_lm8_followers: prev?.lm8_followers ?? null,
      prev_lm8_total_likes: prev?.lm8_total_likes ?? null,
      prev_lm8_posts: prev?.lm8_posts ?? null,
    });

    results.push({ username: acc.username, tiktok: tkStatus, lemon8: lm8Status });

    await new Promise((r) => setTimeout(r, 500));
  }

  // Send Telegram report
  try {
    await sendTelegramReport(today, allMetrics);
  } catch (e) {
    console.error("Telegram send failed:", e);
  }

  return NextResponse.json({
    date: today,
    total: accounts.length,
    results,
  });
}
