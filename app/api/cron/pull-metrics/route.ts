import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Daily RevenueCat summary sent to Telegram. The TikTok, Lemon8 and Pinterest
// parts of this report were retired on 2026-10-09 (see
// archive/removed-pages-2026-10-09/README.md).

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const RC_API_KEY = process.env.REVENUECAT_API_KEY;
const RC_PROJECT_ID = process.env.REVENUECAT_PROJECT_ID;

interface RCReportData {
  activeTrials: number;
  activeSubs: number;
  monthRevenue: number;
  yesterdayRevenue: number;
}

async function fetchRevenueCatReport(): Promise<RCReportData | null> {
  try {
    if (!RC_API_KEY || !RC_PROJECT_ID) return null;

    // Get overview from RevenueCat API directly
    const overviewRes = await fetch(
      `https://api.revenuecat.com/v2/projects/${RC_PROJECT_ID}/metrics/overview`,
      { headers: { Authorization: `Bearer ${RC_API_KEY}`, "Content-Type": "application/json" } }
    );
    const overviewJson = await overviewRes.json();
    const metricsArr: { id: string; value: number }[] = overviewJson.metrics || [];
    const m = Object.fromEntries(metricsArr.map((x) => [x.id, x.value]));

    // Get trial/sub counts from DB directly (same logic as /api/revenuecat)
    const [trialsResult, subsResult] = await Promise.all([
      supabase
        .from("rc_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "trialing")
        .eq("auto_renewal", "will_renew")
        .eq("environment", "production"),
      supabase
        .from("rc_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .eq("environment", "production")
        .gt("revenue_gross", 0),
    ]);

    const activeTrials = trialsResult.count ?? 0;
    const activeSubs = subsResult.count ?? 0;
    const currentRevenue = m.revenue ?? 0;

    // Calculate yesterday's revenue from stored value
    const { data: prevRow } = await supabase
      .from("pinterest_topics")
      .select("times_used")
      .eq("id", "__rc_revenue_tracker__")
      .single();

    const prevRevenueCents = prevRow?.times_used ?? 0;
    const yesterdayRevenue = Math.max(0, currentRevenue - prevRevenueCents / 100);

    // Store today's cumulative (in cents) for tomorrow's diff
    await supabase.from("pinterest_topics").upsert(
      { id: "__rc_revenue_tracker__", category: "system", title_template: "Revenue Tracker", description_template: "system", prompt_seed: "system", times_used: Math.round(currentRevenue * 100) },
      { onConflict: "id" }
    );

    return { activeTrials, activeSubs, monthRevenue: currentRevenue, yesterdayRevenue };
  } catch (e) {
    console.error("RevenueCat report fetch failed:", e);
    return null;
  }
}

async function sendTelegramReport(date: string, rcData: RCReportData) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;

  let msg = `📊 *Daily Content Report*\n🗓 ${date}\n`;
  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `\n📋 *Overall*\n\n`;
  msg += `💰 *Roomy AI*\n`;
  msg += `Yesterday Revenue: $${rcData.yesterdayRevenue.toFixed(2)}\n`;
  msg += `Active Trials: ${rcData.activeTrials}\n`;
  msg += `Active Subs: ${rcData.activeSubs}\n`;
  msg += `Month Revenue: $${rcData.monthRevenue.toFixed(2)}\n`;
  msg += `\n━━━━━━━━━━━━━━━━━━━━`;

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: msg,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  return res.ok;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];

  // Fetch RevenueCat data directly from API + DB
  let rcData: RCReportData | null = null;
  try {
    rcData = await fetchRevenueCatReport();
  } catch (e) {
    console.error("RevenueCat fetch failed:", e);
  }

  let telegram = false;
  if (rcData) {
    try {
      telegram = await sendTelegramReport(today, rcData);
    } catch (e) {
      console.error("Telegram send failed:", e);
    }
  }

  return NextResponse.json({ date: today, revenuecat: rcData !== null, telegram });
}
