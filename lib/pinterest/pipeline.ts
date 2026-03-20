import OpenAI from "openai";
import { supabase } from "@/lib/supabase";
import { buildPinPrompt } from "./prompts";
import { createPostizClient } from "./postiz";
import { generateRandomTimes } from "./scheduler";
import type { PinterestAccount, ContentType, SchedulePinParams } from "./types";

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

/** Pick N least-recently-used topics for a given content type */
async function pickTopics(category: ContentType, count: number) {
  const { data: topics } = await supabase
    .from("pinterest_topics")
    .select("*")
    .eq("category", category)
    .order("times_used", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(count);

  return topics || [];
}

/** Generate a single pin image via GPT-image-1.5 */
async function generateImage(prompt: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await openai.images.generate({
        model: "gpt-image-1.5",
        prompt,
        quality: "medium",
        size: "1024x1536",
        n: 1,
      });
      return result.data?.[0]?.b64_json ?? null;
    } catch (e: unknown) {
      const err = e as { status?: number };
      if (err.status === 400 && attempt < 2) continue; // safety filter — retry
      throw e;
    }
  }
  return null;
}

/** Process a single pin: generate image → upload to Postiz → schedule */
async function processPin(
  pinId: string,
  account: PinterestAccount,
  topic: { id: string; title_template: string; description_template: string; prompt_seed: string },
  scheduledAt: Date
): Promise<{ success: boolean; error?: string }> {
  const postiz = createPostizClient(account.postiz_api_key);

  try {
    // Update status to generating
    await supabase.from("pinterest_pins").update({ status: "generating" }).eq("id", pinId);

    // Build prompt and generate image
    const prompt = buildPinPrompt(account.content_type, {
      titleTemplate: topic.title_template,
      promptSeed: topic.prompt_seed,
    });
    const imageB64 = await generateImage(prompt);
    if (!imageB64) throw new Error("Failed to generate image after 3 attempts");

    // Update status to uploading
    await supabase.from("pinterest_pins").update({ status: "uploading" }).eq("id", pinId);

    // Upload to Postiz
    const imageBuffer = Buffer.from(imageB64, "base64");
    const uploaded = await postiz.uploadImage(imageBuffer, `pin-${pinId}.png`);

    // Schedule on Pinterest via Postiz
    const postId = await postiz.schedulePin({
      integrationId: account.postiz_integration_id,
      boardId: account.board_id,
      imageUrl: uploaded.path,
      imageId: uploaded.id,
      title: topic.title_template,
      description: topic.description_template,
      scheduledAt: scheduledAt.toISOString(),
      appStoreUrl: account.app_store_url || "https://apps.apple.com/app/roomy-ai",
    } as SchedulePinParams);

    // Update pin as scheduled
    await supabase.from("pinterest_pins").update({
      status: "scheduled",
      image_url: uploaded.path,
      postiz_post_id: postId,
      scheduled_at: scheduledAt.toISOString(),
    }).eq("id", pinId);

    // Mark topic as used
    await supabase.from("pinterest_topics").update({
      times_used: (topic as { times_used?: number }).times_used ? (topic as { times_used?: number }).times_used! + 1 : 1,
      last_used_at: new Date().toISOString(),
    }).eq("id", topic.id);

    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await supabase.from("pinterest_pins").update({
      status: "failed",
      error_message: msg,
      retry_count: 1,
    }).eq("id", pinId);
    return { success: false, error: msg };
  }
}

/** Run the full pipeline for one account */
export async function runPipelineForAccount(account: PinterestAccount): Promise<{
  scheduled: number;
  failed: number;
  errors: string[];
}> {
  const count = account.pins_per_day || 10;
  const topics = await pickTopics(account.content_type, count);

  if (topics.length === 0) {
    return { scheduled: 0, failed: 0, errors: ["No topics found for " + account.content_type] };
  }

  // Generate random schedule times for tomorrow (or today if triggered manually)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const times = generateRandomTimes(topics.length, tomorrow);

  // Insert pending pins
  const pinInserts = topics.map((topic, i) => ({
    account_id: account.id,
    topic_id: topic.id,
    title: topic.title_template,
    description: topic.description_template,
    scheduled_at: times[i].toISOString(),
    status: "pending" as const,
  }));

  const { data: pins } = await supabase
    .from("pinterest_pins")
    .insert(pinInserts)
    .select("id");

  if (!pins || pins.length === 0) {
    return { scheduled: 0, failed: 0, errors: ["Failed to insert pins"] };
  }

  // Process each pin sequentially (rate limit friendly)
  let scheduled = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < pins.length; i++) {
    const result = await processPin(pins[i].id, account, topics[i], times[i]);
    if (result.success) {
      scheduled++;
    } else {
      failed++;
      if (result.error) errors.push(`${topics[i].id}: ${result.error}`);
    }

    // Rate limit: wait 4s between pins (Postiz: 30 req/hour = 1 every 2 min, but we make 2 calls per pin)
    if (i < pins.length - 1) {
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  return { scheduled, failed, errors };
}

/** Run the full pipeline for all active accounts */
export async function runFullPipeline(): Promise<string> {
  const { data: accounts } = await supabase
    .from("pinterest_accounts")
    .select("*")
    .eq("status", "active");

  if (!accounts || accounts.length === 0) {
    return "No active Pinterest accounts found";
  }

  const results: string[] = [
    `📌 Pinterest Pipeline — ${new Date().toISOString().split("T")[0]}`,
    "",
  ];

  for (const account of accounts as PinterestAccount[]) {
    const result = await runPipelineForAccount(account);
    const line = result.failed > 0
      ? `${account.name}: ✅ ${result.scheduled} scheduled, ❌ ${result.failed} failed`
      : `${account.name}: ✅ ${result.scheduled} scheduled`;
    results.push(line);

    if (result.errors.length > 0) {
      results.push(`  Errors: ${result.errors.slice(0, 3).join(", ")}`);
    }
  }

  const summary = results.join("\n");

  // Send Telegram summary
  const chatId = ADMIN_CHAT_ID;
  if (chatId) {
    await sendTelegram(chatId, summary);
  }

  return summary;
}
