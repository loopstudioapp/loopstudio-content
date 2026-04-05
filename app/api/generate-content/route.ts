import { NextResponse } from "next/server";
import OpenAI from "openai";
import sharp from "sharp";
import path from "path";
import { supabase } from "@/lib/supabase";
import { generateContent } from "@/lib/generate-prompts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const POSTBRIDGE_KEY = process.env.POSTIZ_API_KEY; // PostBridge API key (stored in POSTIZ_API_KEY env)
const MAX_DAILY = 3;

// Susan's account — special TikTok draft flow via PostBridge
const SUSAN_USERNAME = "@susan.design.roomy";
const SUSAN_TIKTOK_PB_ID = 53506;

/** Generate TikTok-optimized slide texts + title + caption via GPT-4o */
async function generateTikTokContent(basePrompt: string, transformPrompts: string[]) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `You are a TikTok content expert for home design and interior styling. Generate engaging slideshow text for a TikTok post.

The slideshow has ${2 + transformPrompts.length} slides:
- Slide 1: A base room image (the "before" or original space)
- Slides 2-${1 + transformPrompts.length}: Different redesign transformations of that room
- Last slide: App promotion slide

Generate:
1. A hook text for slide 1 that reels in viewers (short, punchy, curiosity-driven)
2. Short text for each transformation slide (1 sentence each, casual tone)
3. Text for the promo slide mentioning Roomy AI
4. A TikTok post title optimized for maximum engagement and reach
5. A TikTok caption optimized for engagement (casual, relatable, no hashtags, no excessive emojis, max 1-2 emojis)

Return ONLY valid JSON:
{
  "slide_texts": ["hook text for slide 1", "text for slide 2", "text for slide 3", ...],
  "promo_text": "text for the app promo slide",
  "title": "...",
  "caption": "..."
}`
    }],
  });
  const raw = res.choices[0]?.message?.content || "";
  return JSON.parse(raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim());
}

/** Upload image to PostBridge and return media_id */
async function uploadToPostBridge(imageBuffer: Buffer, filename: string): Promise<string> {
  // Step 1: Get upload URL
  const urlRes = await fetch("https://api.post-bridge.com/v1/media/create-upload-url", {
    method: "POST",
    headers: { Authorization: `Bearer ${POSTBRIDGE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: filename, mime_type: "image/png", size_bytes: imageBuffer.length }),
  });
  const { media_id, upload_url } = await urlRes.json();

  // Step 2: Upload binary
  await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array(imageBuffer),
  });

  return media_id;
}

/** Post images as TikTok draft via PostBridge */
async function postTikTokDraft(mediaIds: string[], title: string, caption: string) {
  const res = await fetch("https://api.post-bridge.com/v1/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${POSTBRIDGE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      caption,
      media: mediaIds,
      social_accounts: [SUSAN_TIKTOK_PB_ID],
      scheduled_at: null,
      is_draft: true,
      platform_configurations: {
        tiktok: {
          title,
          caption,
          draft: true,
          is_aigc: false,
        },
      },
    }),
  });
  return res.json();
}

async function createTelegramChannel(name: string): Promise<string | null> {
  if (!TELEGRAM_BOT_TOKEN) return null;

  // Create a new group with the bot — we use createChannel for a public-ish channel
  // Actually Telegram bots can't create channels/groups directly via API.
  // Instead we'll just send to the main admin chat and note the account.
  // The user will need to provide chat IDs or we use the main chat.
  return null;
}

async function getOrCreateChatId(account: { id: string; username: string; angle: number; telegram_chat_id: string | null }): Promise<string | null> {
  if (account.telegram_chat_id) return account.telegram_chat_id;

  // Telegram Bot API cannot create groups/channels programmatically.
  // Fall back to admin chat ID.
  const fallbackChatId = process.env.TELEGRAM_CHAT_ID;
  if (!fallbackChatId) return null;

  // Store the fallback so we don't check again
  await supabase
    .from("accounts")
    .update({ telegram_chat_id: fallbackChatId })
    .eq("id", account.id);

  return fallbackChatId;
}

async function sendMediaGroupToTelegram(chatId: string, images: string[]) {
  if (!TELEGRAM_BOT_TOKEN || images.length === 0) return;

  const form = new FormData();
  form.append("chat_id", chatId);

  const media = images.map((_, i) => ({
    type: "photo",
    media: `attach://photo${i}`,
  }));
  form.append("media", JSON.stringify(media));

  for (let i = 0; i < images.length; i++) {
    const buf = Buffer.from(images[i], "base64");
    const blob = new Blob([buf], { type: "image/png" });
    form.append(`photo${i}`, blob, `photo${i}.png`);
  }

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMediaGroup`, {
    method: "POST",
    body: form,
  });
}

async function sendMessageToTelegram(chatId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id");
  if (!accountId) return NextResponse.json({ error: "Missing account_id" }, { status: 400 });

  const today = new Date().toISOString().split("T")[0];
  const { count } = await supabase
    .from("content_generations")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("date", today);

  return NextResponse.json({ used: count ?? 0, max: MAX_DAILY });
}

export async function POST(req: Request) {
  try {
    const { account_id, employee_id } = await req.json();

    if (!account_id || !employee_id) {
      return NextResponse.json({ error: "Missing account_id or employee_id" }, { status: 400 });
    }

    // Fetch account
    const { data: account, error: accError } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", account_id)
      .single();

    if (accError || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Check daily limit
    const today = new Date().toISOString().split("T")[0];
    const { count } = await supabase
      .from("content_generations")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)
      .eq("date", today);

    const used = count ?? 0;
    if (used >= MAX_DAILY) {
      return NextResponse.json({
        error: "Daily limit reached",
        used,
        max: MAX_DAILY,
      }, { status: 429 });
    }

    // Get Telegram chat ID
    const chatId = await getOrCreateChatId(account);

    // Generate prompts from existing data — retry if OpenAI safety filter rejects
    let content = generateContent(account.angle);
    let baseImageB64: string | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const baseResult = await openai.images.generate({
          model: "gpt-image-1.5",
          prompt: content.basePrompt,
          quality: "low",
          size: "1024x1536",
          n: 1,
        });
        baseImageB64 = baseResult.data?.[0]?.b64_json;
        break;
      } catch (e: unknown) {
        const err = e as { status?: number; message?: string };
        if (err.status === 400 && attempt < 2) {
          // Safety filter — re-roll prompts
          content = generateContent(account.angle);
          continue;
        }
        throw e;
      }
    }

    if (!baseImageB64) {
      return NextResponse.json({ error: "Failed to generate base image after retries" }, { status: 500 });
    }

    // Step 2: Generate 5 transform images in parallel using base image
    const baseBuffer = Buffer.from(baseImageB64, "base64");
    const baseFile = new File([baseBuffer], "base.png", { type: "image/png" });

    const transformResults = await Promise.all(
      content.transformPrompts.map(async (prompt) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            return await openai.images.edit({
              model: "gpt-image-1.5",
              image: baseFile,
              prompt,
              quality: "low",
              size: "1024x1536",
              n: 1,
            });
          } catch (e: unknown) {
            const err = e as { status?: number };
            if (err.status === 400 && attempt < 1) continue;
            throw e;
          }
        }
      })
    );

    const transformImages = transformResults.map((r) => r?.data?.[0]?.b64_json).filter(Boolean) as string[];

    // Step 3: Generate promo image (blurred base + App Store card)
    let promoB64: string | null = null;
    try {
      const cardPath = path.join(process.cwd(), "public", "appstore-card.png");
      const cardMeta = await sharp(cardPath).metadata();
      const baseW = 1024;
      const baseH = 1536;
      const targetCardW = Math.round(baseW * 0.8);
      const scale = targetCardW / (cardMeta.width || 588);
      const targetCardH = Math.round((cardMeta.height || 206) * scale);
      const scaledCard = await sharp(cardPath).resize(targetCardW, targetCardH).png().toBuffer();
      const cardX = Math.round((baseW - targetCardW) / 2);
      const cardY = Math.round((baseH / 2) - targetCardH / 2 - 220);
      const promoBuffer = await sharp(baseBuffer).blur(5).composite([{ input: scaledCard, left: cardX, top: cardY }]).png().toBuffer();
      promoB64 = promoBuffer.toString("base64");
    } catch { /* skip promo if it fails */ }

    // === SUSAN SPECIAL FLOW: strip metadata → TikTok draft via PostBridge + slide texts to Telegram ===
    const isSusan = account.username === SUSAN_USERNAME;

    if (isSusan && POSTBRIDGE_KEY) {
      // Strip metadata from ALL images
      // Strip ONLY caBX chunk (C2PA AI metadata) — keep everything else intact
      const stripMeta = async (b64: string) => {
        const raw = Buffer.from(b64, "base64");
        const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        const parts: Buffer[] = [];
        let p = 8;
        while (p < raw.length) {
          const len = raw.readUInt32BE(p);
          const type = raw.toString("ascii", p + 4, p + 8);
          const total = 12 + len;
          if (type !== "caBX") parts.push(raw.slice(p, p + total));
          p += total;
        }
        return Buffer.concat([SIG, ...parts]);
      };
      const cleanBase = await stripMeta(baseImageB64);
      const cleanTransforms = await Promise.all(transformImages.map(stripMeta));
      const cleanPromo = promoB64 ? await stripMeta(promoB64) : null;

      // Upload all images to PostBridge
      const allClean = [cleanBase, ...cleanTransforms];
      if (cleanPromo) allClean.push(cleanPromo);
      const mediaIds = await Promise.all(
        allClean.map((buf, i) => uploadToPostBridge(buf, `slide-${i}.png`))
      );

      // Generate TikTok-optimized text via GPT-4o
      const tikTokContent = await generateTikTokContent(content.basePrompt, content.transformPrompts);

      // Post as TikTok draft
      await postTikTokDraft(mediaIds, tikTokContent.title, tikTokContent.caption);

      // Send slide texts + title/caption to Telegram for manual posting
      if (chatId) {
        const handle = account.username.replace(/^@/, "");
        await sendMessageToTelegram(chatId, `🎬 TikTok Draft Created (${used + 1}/${MAX_DAILY}) — @${handle}`);
        await sendMessageToTelegram(chatId, `📱 *Title:* ${tikTokContent.title}\n\n📝 *Caption:* ${tikTokContent.caption}`);

        // Send slide texts
        let slideMsg = "📋 *Slide Texts:*\n";
        const slideTexts: string[] = tikTokContent.slide_texts || [];
        slideTexts.forEach((text: string, i: number) => {
          slideMsg += `\nSlide ${i + 1}: ${text}`;
        });
        if (tikTokContent.promo_text) {
          slideMsg += `\nSlide ${slideTexts.length + 1} (promo): ${tikTokContent.promo_text}`;
        }
        await sendMessageToTelegram(chatId, slideMsg);
      }

      // Record generation
      await supabase.from("content_generations").insert({
        account_id,
        employee_id: employee_id === "admin" ? null : employee_id,
        date: today,
        title: tikTokContent.title,
        caption: tikTokContent.caption,
      });

      return NextResponse.json({
        success: true,
        title: tikTokContent.title,
        caption: tikTokContent.caption,
        imagesGenerated: allClean.length,
        sentToTikTokDraft: true,
        sentToTelegram: !!chatId,
        used: used + 1,
        max: MAX_DAILY,
        remaining: MAX_DAILY - used - 1,
      });
    }

    // === DEFAULT FLOW: Send to Telegram ===
    if (chatId) {
      const handle = account.username.replace(/^@/, "");

      // Message 1: Header
      await sendMessageToTelegram(chatId, `📸 New Content (${used + 1}/${MAX_DAILY}) — @${handle}`);

      // Message 2: Title only (easy copy-paste)
      await sendMessageToTelegram(chatId, content.title);

      // Message 3: Caption only (easy copy-paste)
      await sendMessageToTelegram(chatId, content.caption);

      // Message 4: All images (1 base + 5 transforms + 1 promo)
      const allImages = [baseImageB64, ...transformImages];
      if (promoB64) allImages.push(promoB64);
      await sendMediaGroupToTelegram(chatId, allImages);
    }

    // Record generation
    await supabase.from("content_generations").insert({
      account_id,
      employee_id: employee_id === "admin" ? null : employee_id,
      date: today,
      title: content.title,
      caption: content.caption,
    });

    return NextResponse.json({
      success: true,
      title: content.title,
      caption: content.caption,
      imagesGenerated: 1 + transformImages.length,
      sentToTelegram: !!chatId,
      used: used + 1,
      max: MAX_DAILY,
      remaining: MAX_DAILY - used - 1,
    });
  } catch (error) {
    console.error("Generate content error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
