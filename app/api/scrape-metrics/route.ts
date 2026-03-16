import { NextResponse } from "next/server";

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

  // Lemon8 embeds URL-encoded JSON in a script with loaderData
  const scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
  for (const script of scripts) {
    const inner = script.replace(/<\/?script[^>]*>/g, "");
    if (!inner.includes("loaderData")) continue;

    const decoded = decodeURIComponent(inner);
    const data = JSON.parse(decoded);
    const loader = data?.state?.loaderData;
    if (!loader) continue;

    // Find the user detail key
    for (const val of Object.values(loader)) {
      if (typeof val !== "object" || val === null) continue;
      const record = val as Record<string, unknown>;
      // Find the $UserDetailV2 key
      for (const [k, v] of Object.entries(record)) {
        if (k.startsWith("$UserDetailV2") && typeof v === "object" && v !== null) {
          const user = v as Record<string, number>;
          return {
            followers: user.followerCount ?? 0,
            following: user.followingCount ?? 0,
            total_likes: user.dugCount ?? 0, // likes received
            posts: user.postCount ?? 0,
          };
        }
      }
    }
  }
  return null;
}

export async function POST(req: Request) {
  const { username, platform } = await req.json();
  const handle = username.replace(/^@/, "");

  try {
    if (platform === "lemon8") {
      const stats = await scrapeLemon8(handle);
      if (!stats) return NextResponse.json({ error: "Could not parse Lemon8" }, { status: 400 });
      return NextResponse.json(stats);
    } else {
      const stats = await scrapeTikTok(handle);
      if (!stats) return NextResponse.json({ error: "Could not parse TikTok" }, { status: 400 });
      return NextResponse.json(stats);
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to fetch: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
