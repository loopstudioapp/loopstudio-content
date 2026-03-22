import OpenAI from "openai";
import { supabase } from "@/lib/supabase";
import { uploadImage, schedulePin } from "./postiz";
import { generateRandomTimes } from "./scheduler";
import type { PinterestAccount, SchedulePinParams } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const APP_NAME = "Roomy AI";

async function sendTelegram(chatId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

/** Strip markdown code fences and parse JSON */
function parseJSON<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

/** Get last 20 pin titles for dedup */
async function getRecentTitles(accountId: string): Promise<string[]> {
  const { data } = await supabase
    .from("pinterest_pins")
    .select("title")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data || []).map((r) => r.title);
}

/* ═══════════════════════════════════════════════════════════════
   STEP 1: Generate Infographic Idea via GPT-4o
   ═══════════════════════════════════════════════════════════════ */
interface InfographicIdea {
  title: string;
  steps: { step_title: string; description: string }[];
}

async function generateIdea(recentTitles: string[]): Promise<InfographicIdea> {
  const recentList = recentTitles.length > 0
    ? recentTitles.map((t) => `- ${t}`).join("\n")
    : "(none)";

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Generate a step-by-step infographic idea for a Pinterest pin about home design, interior styling, or room organization.

Requirements:
- Can be any number of steps (3-7), whatever fits the topic best
- Title should be catchy, viral on pinterest and SEO-friendly
- Focus on topics that interior designers, homeowners, renters, and design enthusiasts search for
- Topics: bedroom, living room, kitchen, bathroom, closet, small spaces, apartments, color schemes, furniture arrangement, lighting, cozy vibes, minimalist, modern, boho, scandinavian, etc.

Do NOT repeat these recent topics:
${recentList}

Return ONLY valid JSON:
{
    "title": "...",
    "steps": [
        {"step_title": "...", "description": "..."},
        ...
    ]
}`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content || "";
  return parseJSON<InfographicIdea>(raw);
}

/* ═══════════════════════════════════════════════════════════════
   STEP 2: Generate Infographic Image
   ═══════════════════════════════════════════════════════════════ */

/** Step 2a: GPT-4o crafts the image generation prompt */
async function craftImagePrompt(idea: InfographicIdea): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Write a detailed image generation prompt for:
Make a pinterest infographics "${idea.title}" with a plain light beige/cream background (#F5F0E8). At the very bottom, add a simple clean banner with just the text "${APP_NAME}", the CTA "Design Your Home In Seconds!", and an App Store download badge. No phone mockups, no app screenshots, no logos, no icons, no app icons, no symbols next to the app name — only plain text and the App Store download badge.
Return ONLY the prompt text, nothing else.`,
      },
    ],
  });

  return res.choices[0]?.message?.content?.trim() || "";
}

/** Step 2b: Generate the image with gpt-image-1.5 */
async function generateImage(prompt: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await openai.images.generate({
        model: "gpt-image-1.5",
        prompt,
        quality: "low",
        size: "1024x1536",
        n: 1,
      });
      return result.data?.[0]?.b64_json ?? null;
    } catch (e: unknown) {
      const err = e as { status?: number };
      if (err.status === 400 && attempt < 2) continue;
      throw e;
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   STEP 3: Generate SEO Metadata via GPT-4o
   ═══════════════════════════════════════════════════════════════ */
interface SEOMetadata {
  pin_title: string;
  description: string;
  tags: string[];
  board_name: string;
}

async function generateSEO(idea: InfographicIdea): Promise<SEOMetadata> {
  const stepTitles = idea.steps.map((s) => s.step_title);

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are a Pinterest SEO expert. Generate optimized metadata for a pin about:

Title: ${idea.title}
Steps: ${JSON.stringify(stepTitles)}

Generate:
1. **pin_title**: Catchy, keyword-rich title (max 100 chars). Use power words (Easy, Ultimate, Best, Simple). Include the room/design topic.
2. **description**: SEO-optimized description (150-300 chars). Include relevant keywords naturally. End with a CTA mentioning ${APP_NAME} for AI room design.
3. **tags**: 8-12 relevant Pinterest tags/keywords. Mix broad ("home decor") and specific ("small bedroom ideas"). Include trending terms.
4. **board_name**: Best board name for this pin (e.g., "Bedroom Design Ideas", "Small Space Solutions")

Return ONLY valid JSON:
{
    "pin_title": "...",
    "description": "...",
    "tags": ["...", "..."],
    "board_name": "..."
}`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content || "";
  return parseJSON<SEOMetadata>(raw);
}

/* ═══════════════════════════════════════════════════════════════
   STEP 4: Upload & Post via Postiz
   ═══════════════════════════════════════════════════════════════ */
async function uploadAndPost(
  apiKey: string,
  imageB64: string,
  pinId: string,
  account: PinterestAccount,
  seo: SEOMetadata,
  scheduledAt: Date
): Promise<{ imageUrl: string; postId: string }> {
  const imageBuffer = Buffer.from(imageB64, "base64");
  const uploaded = await uploadImage(apiKey, imageBuffer, `pin-${pinId}.png`);

  const postId = await schedulePin(apiKey, {
    integrationId: account.postiz_integration_id,
    boardId: account.board_id,
    imageUrl: uploaded.path,
    imageId: uploaded.id,
    title: seo.pin_title,
    description: seo.description,
    scheduledAt: scheduledAt.toISOString(),
    appStoreUrl: account.app_store_url || "https://apps.apple.com/app/roomy-ai",
  } as SchedulePinParams);

  return { imageUrl: uploaded.path, postId };
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PIPELINE — Process one pin end-to-end
   ═══════════════════════════════════════════════════════════════ */
async function processPin(
  pinId: string,
  account: PinterestAccount,
  recentTitles: string[],
  scheduledAt: Date
): Promise<{ success: boolean; title?: string; error?: string }> {
  try {
    // Step 1: Generate idea
    await supabase.from("pinterest_pins").update({ status: "generating" }).eq("id", pinId);
    const idea = await generateIdea(recentTitles);

    // Update pin with generated title
    await supabase.from("pinterest_pins").update({
      title: idea.title,
      topic_id: idea.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
    }).eq("id", pinId);

    // Step 2: Generate image
    const imagePrompt = await craftImagePrompt(idea);
    const imageB64 = await generateImage(imagePrompt);
    if (!imageB64) throw new Error("Image generation failed after 3 attempts");

    // Step 3: Generate SEO metadata
    const seo = await generateSEO(idea);

    // Update pin with SEO data
    await supabase.from("pinterest_pins").update({
      title: seo.pin_title,
      description: seo.description,
      status: "uploading",
    }).eq("id", pinId);

    // Step 4: Upload & schedule via Postiz
    const { imageUrl, postId } = await uploadAndPost(
      account.postiz_api_key,
      imageB64,
      pinId,
      account,
      seo,
      scheduledAt
    );

    // Mark as scheduled
    await supabase.from("pinterest_pins").update({
      status: "scheduled",
      image_url: imageUrl,
      postiz_post_id: postId,
      scheduled_at: scheduledAt.toISOString(),
    }).eq("id", pinId);

    return { success: true, title: seo.pin_title };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await supabase.from("pinterest_pins").update({
      status: "failed",
      error_message: msg,
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
  const recentTitles = await getRecentTitles(account.id);

  // Generate random schedule times for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const times = generateRandomTimes(count, tomorrow);

  // Insert placeholder pins
  const pinInserts = Array.from({ length: count }, (_, i) => ({
    account_id: account.id,
    topic_id: "generating",
    title: "Generating...",
    description: "",
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

  let scheduled = 0;
  let failed = 0;
  const errors: string[] = [];
  const usedTitles = [...recentTitles];

  for (let i = 0; i < pins.length; i++) {
    const result = await processPin(pins[i].id, account, usedTitles, times[i]);

    if (result.success) {
      scheduled++;
      if (result.title) usedTitles.push(result.title);
    } else {
      failed++;
      if (result.error) errors.push(result.error);
    }

    // Random delay 2-5 min between pins (anti-spam + rate limit)
    if (i < pins.length - 1) {
      const delay = (120 + Math.random() * 180) * 1000;
      await new Promise((r) => setTimeout(r, delay));
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

  if (ADMIN_CHAT_ID) {
    await sendTelegram(ADMIN_CHAT_ID, summary);
  }

  return summary;
}
