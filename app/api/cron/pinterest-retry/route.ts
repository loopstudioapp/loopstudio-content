import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { uploadImage, schedulePin } from "@/lib/pinterest/postiz";
import { buildPinPrompt } from "@/lib/pinterest/prompts";
import type { PinterestAccount } from "@/lib/pinterest/types";
import OpenAI from "openai";

export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
    const account = pin.pinterest_accounts as unknown as PinterestAccount;
    if (!account) continue;

    try {
      // Get topic
      const { data: topic } = await supabase
        .from("pinterest_topics")
        .select("*")
        .eq("id", pin.topic_id)
        .single();

      if (!topic) continue;

      // Generate image
      const prompt = buildPinPrompt(account.content_type, {
        titleTemplate: topic.title_template,
        promptSeed: topic.prompt_seed,
      });

      const result = await openai.images.generate({
        model: "gpt-image-1.5",
        prompt,
        quality: "medium",
        size: "1024x1536",
        n: 1,
      });

      const imageB64 = result.data?.[0]?.b64_json;
      if (!imageB64) throw new Error("No image generated");

      // Upload and schedule
      const imageBuffer = Buffer.from(imageB64, "base64");
      const uploaded = await uploadImage(account.postiz_api_key, imageBuffer, `pin-retry-${pin.id}.png`);
      const postId = await schedulePin(account.postiz_api_key, {
        integrationId: account.postiz_integration_id,
        boardId: account.board_id,
        imageUrl: uploaded.path,
        title: pin.title,
        description: pin.description,
        scheduledAt: pin.scheduled_at || new Date().toISOString(),
        appStoreUrl: account.app_store_url || "https://apps.apple.com/us/app/interior-design-roomy-ai/id6759851023?ct=pinterest&mt=8",
      });

      await supabase.from("pinterest_pins").update({
        status: "scheduled",
        image_url: uploaded.path,
        postiz_post_id: postId,
        error_message: null,
      }).eq("id", pin.id);

      succeeded++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Retry failed";
      await supabase.from("pinterest_pins").update({
        retry_count: (pin.retry_count || 0) + 1,
        error_message: msg,
      }).eq("id", pin.id);
    }

    retried++;
    await new Promise((r) => setTimeout(r, 4000));
  }

  const summary = `🔄 Pinterest Retry — ${succeeded}/${retried} recovered`;
  if (ADMIN_CHAT_ID && retried > 0) {
    await sendTelegram(ADMIN_CHAT_ID, summary);
  }

  return NextResponse.json({ ok: true, retried, succeeded });
}
