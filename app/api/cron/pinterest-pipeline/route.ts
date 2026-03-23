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
import { generateRandomTimes } from "@/lib/pinterest/scheduler";
import type { PinterestAccount } from "@/lib/pinterest/types";

export const maxDuration = 300;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text }),
  });
}

/**
 * Process a single scheduled slot: run the full pin pipeline.
 * Returns { success, title?, error? }
 */
async function processScheduleSlot(
  slotId: string,
  account: PinterestAccount,
  recentTitles: string[]
): Promise<{ success: boolean; title?: string; error?: string }> {
  // Mark slot as processing
  await supabase
    .from("pinterest_schedule")
    .update({ status: "processing" })
    .eq("id", slotId);

  try {
    // Step 1: Generate idea
    const idea = await generateIdea(recentTitles);

    // Step 2: Generate image
    const imagePrompt = buildImagePrompt(idea);
    const imageB64 = await generateImage(imagePrompt);
    if (!imageB64) throw new Error("Image generation failed after 3 attempts");

    // Step 3: Generate SEO
    const seo = await generateSEO(idea);

    // Step 4: Create a pin record
    const { data: pin } = await supabase
      .from("pinterest_pins")
      .insert({
        account_id: account.id,
        topic_id: idea.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
        title: seo.pin_title,
        description: seo.description,
        status: "uploading",
      })
      .select("id")
      .single();

    if (!pin) throw new Error("Failed to insert pin record");

    // Step 5: Upload & post immediately (scheduled_at = now)
    const scheduledAt = new Date();
    const { imageUrl, postId } = await uploadAndPost(
      account.postiz_api_key,
      imageB64,
      pin.id,
      account,
      seo,
      scheduledAt
    );

    // Update pin as scheduled
    await supabase
      .from("pinterest_pins")
      .update({
        status: "scheduled",
        image_url: imageUrl,
        postiz_post_id: postId,
        scheduled_at: scheduledAt.toISOString(),
      })
      .eq("id", pin.id);

    // Mark schedule slot as done
    await supabase
      .from("pinterest_schedule")
      .update({ status: "done", pin_id: pin.id })
      .eq("id", slotId);

    return { success: true, title: seo.pin_title };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";

    // Mark schedule slot as failed
    await supabase
      .from("pinterest_schedule")
      .update({ status: "failed" })
      .eq("id", slotId);

    return { success: false, error: msg };
  }
}

/**
 * Ensure an account has schedule entries for tomorrow.
 * Only generates if no pending entries exist for tomorrow.
 */
async function ensureTomorrowSchedule(accountId: string) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStart = new Date(tomorrow);
  tomorrowStart.setUTCHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setUTCHours(23, 59, 59, 999);

  // Check if tomorrow already has pending entries
  const { count } = await supabase
    .from("pinterest_schedule")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .gte("scheduled_at", tomorrowStart.toISOString())
    .lte("scheduled_at", tomorrowEnd.toISOString())
    .eq("status", "pending");

  if ((count ?? 0) > 0) return; // Already has entries

  // Generate 5 random times for tomorrow (2hr+ apart)
  const times = generateRandomTimes(5, tomorrow, 120);

  const inserts = times.map((t) => ({
    account_id: accountId,
    scheduled_at: t.toISOString(),
    status: "pending" as const,
  }));

  await supabase.from("pinterest_schedule").insert(inserts);
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Get all running accounts
  const { data: accounts } = await supabase
    .from("pinterest_accounts")
    .select("*")
    .eq("status", "active")
    .eq("running", true);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, message: "No running accounts" });
  }

  const results: string[] = [];
  let totalProcessed = 0;
  let totalFailed = 0;

  for (const account of accounts as PinterestAccount[]) {
    // Find pending schedule slots where time has passed
    const { data: dueSlots } = await supabase
      .from("pinterest_schedule")
      .select("*")
      .eq("account_id", account.id)
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true });

    if (!dueSlots || dueSlots.length === 0) {
      // No due slots — ensure tomorrow's schedule exists
      await ensureTomorrowSchedule(account.id);
      continue;
    }

    const recentTitles = await getRecentTitles(account.id);

    for (const slot of dueSlots) {
      const result = await processScheduleSlot(slot.id, account, recentTitles);

      if (result.success) {
        totalProcessed++;
        if (result.title) recentTitles.push(result.title);
        results.push(`${account.name}: posted "${result.title}"`);
      } else {
        totalFailed++;
        results.push(`${account.name}: FAILED — ${result.error}`);
      }

      // Delay between pins for rate limiting
      if (dueSlots.indexOf(slot) < dueSlots.length - 1) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    // Ensure tomorrow's schedule exists
    await ensureTomorrowSchedule(account.id);
  }

  // Send Telegram notification if any pins were processed
  if (totalProcessed > 0 || totalFailed > 0) {
    const summary = [
      `📌 Pinterest Scheduler — ${new Date().toISOString().split("T")[0]}`,
      `✅ ${totalProcessed} posted, ❌ ${totalFailed} failed`,
      "",
      ...results,
    ].join("\n");
    await sendTelegram(summary);
  }

  return NextResponse.json({
    ok: true,
    processed: totalProcessed,
    failed: totalFailed,
    details: results,
  });
}
