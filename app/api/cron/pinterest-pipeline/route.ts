import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  generateIdea,
  buildImagePrompt,
  generateImage,
  generateSEO,
  uploadAndPost,
  getRecentTitles,
  generateBeforeAfterIdea,
  buildBeforeAfterPrompt,
  generateBeforeAfterSEO,
} from "@/lib/pinterest/pipeline";
import { generateRandomTimes, getTomorrowEastern } from "@/lib/pinterest/scheduler";
import type { PinterestAccount } from "@/lib/pinterest/types";

export const maxDuration = 300;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/** Safety cutoff: stop processing if elapsed > 240s (4 min) */
const TIMEOUT_MS = 240_000;

async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text }),
  });
}

/**
 * Daily cron (1AM VN / 18:00 UTC):
 * For each running account, generate pins and SCHEDULE them via Postiz
 * at random times throughout the next US day (6AM-11PM Eastern, 2hr+ apart).
 * Postiz handles posting at the scheduled times.
 *
 * Includes a 4-minute safety cutoff to stay under maxDuration=300.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

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
  let totalScheduled = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  // Schedule for tomorrow in US Eastern time
  const targetDate = getTomorrowEastern();

  for (const account of accounts as PinterestAccount[]) {
    const pinsPerDay = account.pins_per_day || 5;

    // Generate random times for the next US day (2hr+ apart)
    const scheduleTimes = generateRandomTimes(pinsPerDay, targetDate, 120);

    const recentTitles = await getRecentTitles(account.id);

    for (let i = 0; i < pinsPerDay; i++) {
      // Time safety check: stop if we've been running > 4 minutes
      const elapsed = Date.now() - startTime;
      if (elapsed > TIMEOUT_MS) {
        const remaining = pinsPerDay - i;
        totalSkipped += remaining;
        results.push(`${account.name}: SKIPPED ${remaining} pins (timeout at ${Math.round(elapsed / 1000)}s)`);
        break;
      }

      const scheduledAt = scheduleTimes[i];

      try {
        // Step 1: Generate idea
        const idea = await generateIdea(recentTitles);

        // Step 2: Generate image
        const imagePrompt = buildImagePrompt(idea);
        const imageB64 = await generateImage(imagePrompt);
        if (!imageB64) throw new Error("Image generation failed");

        // Step 3: Generate SEO
        const seo = await generateSEO(idea);

        // Step 4: Create pin record
        const { data: pin } = await supabase
          .from("pinterest_pins")
          .insert({
            account_id: account.id,
            topic_id: idea.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
            title: seo.pin_title,
            description: seo.description,
            status: "uploading",
            scheduled_at: scheduledAt.toISOString(),
          })
          .select("id")
          .single();

        if (!pin) throw new Error("Failed to insert pin record");

        // Step 5: Upload & SCHEDULE via Postiz at the random time
        const { imageUrl, postId } = await uploadAndPost(
          account.postiz_api_key,
          imageB64,
          pin.id,
          account,
          seo,
          scheduledAt
        );

        // Update pin as scheduled
        await supabase.from("pinterest_pins").update({
          status: "scheduled",
          image_url: imageUrl,
          postiz_post_id: postId,
        }).eq("id", pin.id);

        // Also track in pinterest_schedule
        await supabase.from("pinterest_schedule").insert({
          account_id: account.id,
          scheduled_at: scheduledAt.toISOString(),
          pin_id: pin.id,
          status: "done",
        });

        totalScheduled++;
        recentTitles.push(seo.pin_title);
        results.push(`${account.name}: scheduled "${seo.pin_title}" at ${scheduledAt.toISOString()}`);
      } catch (e: unknown) {
        totalFailed++;
        const msg = e instanceof Error ? e.message : "Unknown error";
        results.push(`${account.name}: FAILED pin ${i + 1} — ${msg}`);
      }

      // Short delay between pins for rate limiting (2s)
      if (i < pinsPerDay - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  // ═══════════════ BEFORE/AFTER LOOP ═══════════════
  const { data: baAccounts } = await supabase
    .from("pinterest_accounts")
    .select("*")
    .eq("status", "active")
    .eq("ba_running", true);

  if (baAccounts && baAccounts.length > 0) {
    for (const account of baAccounts as PinterestAccount[]) {
      const baPinsPerDay = 5;
      const baScheduleTimes = generateRandomTimes(baPinsPerDay, targetDate, 120);
      const baRecentTitles = await getRecentTitles(account.id);

      for (let i = 0; i < baPinsPerDay; i++) {
        // Time safety check
        const elapsed = Date.now() - startTime;
        if (elapsed > TIMEOUT_MS) {
          const remaining = baPinsPerDay - i;
          totalSkipped += remaining;
          results.push(`${account.name} [B/A]: SKIPPED ${remaining} pins (timeout at ${Math.round(elapsed / 1000)}s)`);
          break;
        }

        const scheduledAt = baScheduleTimes[i];

        try {
          // Step 1: Generate before/after idea
          const idea = await generateBeforeAfterIdea(baRecentTitles);

          // Step 2: Generate image
          const imagePrompt = buildBeforeAfterPrompt(idea);
          const imageB64 = await generateImage(imagePrompt);
          if (!imageB64) throw new Error("Image generation failed");

          // Step 3: Generate SEO
          const seo = await generateBeforeAfterSEO(idea);

          // Step 4: Create pin record (topic_id starts with "ba-")
          const { data: pin } = await supabase
            .from("pinterest_pins")
            .insert({
              account_id: account.id,
              topic_id: "ba-" + idea.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 57),
              title: seo.pin_title,
              description: seo.description,
              status: "uploading",
              scheduled_at: scheduledAt.toISOString(),
            })
            .select("id")
            .single();

          if (!pin) throw new Error("Failed to insert pin record");

          // Step 5: Upload & schedule via Postiz
          const { imageUrl, postId } = await uploadAndPost(
            account.postiz_api_key,
            imageB64,
            pin.id,
            account,
            seo,
            scheduledAt
          );

          // Update pin as scheduled
          await supabase.from("pinterest_pins").update({
            status: "scheduled",
            image_url: imageUrl,
            postiz_post_id: postId,
          }).eq("id", pin.id);

          // Track in pinterest_schedule
          await supabase.from("pinterest_schedule").insert({
            account_id: account.id,
            scheduled_at: scheduledAt.toISOString(),
            pin_id: pin.id,
            status: "done",
          });

          totalScheduled++;
          baRecentTitles.push(seo.pin_title);
          results.push(`${account.name} [B/A]: scheduled "${seo.pin_title}" at ${scheduledAt.toISOString()}`);
        } catch (e: unknown) {
          totalFailed++;
          const msg = e instanceof Error ? e.message : "Unknown error";
          results.push(`${account.name} [B/A]: FAILED pin ${i + 1} — ${msg}`);
        }

        // Short delay between pins (2s)
        if (i < baPinsPerDay - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  }

  // Telegram notification
  if (totalScheduled > 0 || totalFailed > 0 || totalSkipped > 0) {
    const summary = [
      `Pinterest Daily — ${new Date().toISOString().split("T")[0]}`,
      `${totalScheduled} scheduled, ${totalFailed} failed, ${totalSkipped} skipped`,
      "",
      ...results,
    ].join("\n");
    await sendTelegram(summary);
  }

  return NextResponse.json({
    ok: true,
    scheduled: totalScheduled,
    failed: totalFailed,
    skipped: totalSkipped,
    details: results,
  });
}
