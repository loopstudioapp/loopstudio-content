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

  const scripts = html.match(/<script[^>]*>(.*?)<\/script>/gs) || [];
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
  const results: { username: string; tiktok: string; lemon8: string }[] = [];

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

    results.push({ username: acc.username, tiktok: tkStatus, lemon8: lm8Status });

    await new Promise((r) => setTimeout(r, 500));
  }

  return NextResponse.json({
    date: today,
    total: accounts.length,
    results,
  });
}
