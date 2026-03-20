import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";
import { generateContent } from "@/lib/generate-prompts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAX_DAILY = 3;

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
          quality: "medium",
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
              quality: "medium",
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

    // Step 3: Send to Telegram (4 messages)
    if (chatId) {
      const handle = account.username.replace(/^@/, "");

      // Message 1: Header
      await sendMessageToTelegram(chatId, `📸 New Content (${used + 1}/${MAX_DAILY}) — @${handle}`);

      // Message 2: Title only (easy copy-paste)
      await sendMessageToTelegram(chatId, content.title);

      // Message 3: Caption only (easy copy-paste)
      await sendMessageToTelegram(chatId, content.caption);

      // Message 4: All 6 images in one media group (compressed)
      const allImages = [baseImageB64, ...transformImages];
      await sendMediaGroupToTelegram(chatId, allImages);
    }

    // Step 4: Record generation
    await supabase.from("content_generations").insert({
      account_id,
      employee_id,
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
