import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  generateIdea,
  buildImagePrompt,
  generateImage,
  generateSEO,
  uploadAndPost,
  getRecentTitles,
} from "@/lib/pinterest/pipeline";
import type { PinterestAccount } from "@/lib/pinterest/types";

export const maxDuration = 300;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/** Safety cutoff: stop processing if elapsed > 240s (4 min) */
const TIMEOUT_MS = 240_000;

async function sendTelegram(chatId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  // Get failed pins with retry_count < 3
  const { data: failedPins } = await supabase
    .from("pinterest_pins")
    .select("*, pinterest_accounts(*)")
    .eq("status", "failed")
    .lt("retry_count", 3)
    .limit(30);

  if (!failedPins || failedPins.length === 0) {
    return NextResponse.json({ ok: true, retried: 0 });
  }

  let retried = 0;
  let succeeded = 0;

  for (const pin of failedPins) {
    // Time safety check
    if (Date.now() - startTime > TIMEOUT_MS) break;

    const account = pin.pinterest_accounts as unknown as PinterestAccount;
    if (!account) continue;

    try {
      // Increment retry_count immediately
      await supabase.from("pinterest_pins").update({
        retry_count: (pin.retry_count || 0) + 1,
        status: "generating",
        error_message: null,
      }).eq("id", pin.id);

      // Re-run the full pipeline: generate fresh idea + image + SEO
      const recentTitles = await getRecentTitles(account.id);
      const idea = await generateIdea(recentTitles);

      const imagePrompt = buildImagePrompt(idea);
      const imageB64 = await generateImage(imagePrompt);
      if (!imageB64) throw new Error("Image generation failed");

      const seo = await generateSEO(idea);

      // Update pin with new content
      await supabase.from("pinterest_pins").update({
        title: seo.pin_title,
        description: seo.description,
        topic_id: idea.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
        status: "uploading",
      }).eq("id", pin.id);

      // Upload & schedule via PostBridge (uploadAndPost already strips metadata with sharp)
      const scheduledAt = pin.scheduled_at ? new Date(pin.scheduled_at) : new Date();
      const { imageUrl, postId } = await uploadAndPost(
        account.postiz_api_key,
        imageB64,
        pin.id,
        account,
        seo,
        scheduledAt
      );

      await supabase.from("pinterest_pins").update({
        status: "scheduled",
        image_url: imageUrl,
        postiz_post_id: postId,
        error_message: null,
      }).eq("id", pin.id);

      succeeded++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Retry failed";
      await supabase.from("pinterest_pins").update({
        status: "failed",
        error_message: msg,
      }).eq("id", pin.id);
    }

    retried++;
    await new Promise((r) => setTimeout(r, 2000));
  }

  const summary = `Pinterest Retry — ${succeeded}/${retried} recovered`;
  if (ADMIN_CHAT_ID && retried > 0) {
    await sendTelegram(ADMIN_CHAT_ID, summary);
  }

  return NextResponse.json({ ok: true, retried, succeeded });
}
