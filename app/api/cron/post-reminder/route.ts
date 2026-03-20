import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendMessage(chatId: string, text: string) {
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

  // Get current hour in Vietnam time (UTC+7)
  const vnHour = new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCHours();

  // Determine which reminder this is
  let timeLabel = "";
  if (vnHour >= 7 && vnHour <= 9) timeLabel = "8:00 AM";
  else if (vnHour >= 15 && vnHour <= 17) timeLabel = "4:00 PM";
  else if (vnHour >= 20 && vnHour <= 22) timeLabel = "9:00 PM";
  else timeLabel = `${vnHour}:00`;

  // Get today's date
  const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Get all active accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, username, angle, telegram_chat_id")
    .eq("status", "Active");

  // Get today's generation counts per account
  const { data: generations } = await supabase
    .from("content_generations")
    .select("account_id")
    .eq("date", today);

  const genCounts: Record<string, number> = {};
  for (const g of generations || []) {
    genCounts[g.account_id] = (genCounts[g.account_id] || 0) + 1;
  }

  // Build reminder message
  const lines: string[] = [
    `⏰ Post Reminder — ${timeLabel} VN`,
    "",
  ];

  for (const acc of accounts || []) {
    const handle = acc.username.replace(/^@/, "");
    const posted = genCounts[acc.id] || 0;
    const remaining = 3 - posted;
    const status = remaining <= 0 ? "✅ Done" : `⚠️ ${remaining} post${remaining > 1 ? "s" : ""} remaining`;
    lines.push(`@${handle} — ${status}`);
  }

  const message = lines.join("\n");

  // Send to admin chat
  if (ADMIN_CHAT_ID) {
    await sendMessage(ADMIN_CHAT_ID, message);
  }

  return NextResponse.json({ ok: true, message });
}
