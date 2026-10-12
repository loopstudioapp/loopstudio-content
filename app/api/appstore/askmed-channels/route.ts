import { NextRequest, NextResponse } from "next/server";
import { readAskMedChannelDays, syncAskMedChannels } from "@/lib/appstore/channels";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * AskMed sales by App Store source (Meta vs organic split on /owner).
 *
 * GET /api/appstore/askmed-channels             saved Apple days (last 40)
 * GET /api/appstore/askmed-channels?refresh=1   download new Analytics Reports files first (cron)
 * Both need `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const from = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
  try {
    const sync = request.nextUrl.searchParams.get("refresh") === "1" ? await syncAskMedChannels() : null;
    return NextResponse.json({ ok: true, sync, days: await readAskMedChannelDays(from) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AskMed channel sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
