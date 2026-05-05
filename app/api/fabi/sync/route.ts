import { NextRequest, NextResponse } from "next/server";
import {
  getOverview,
  getOverviewRange,
  persistDailySales,
  readDailySales,
  vnDateRange,
  vnDateString,
} from "@/lib/fabi/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sync FABi sales and return last 30 days.
 *
 * GET /api/fabi/sync
 *   - Default: refresh today only (Vercel cron + dashboard refresh both hit this)
 *   - ?backfill=30: refresh last N days (one-time seed; capped at 90)
 *   - ?cached=1: read-only, no API call (faster mount load)
 */
async function handle(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cached = searchParams.get("cached") === "1";
  const backfillDays = parseInt(searchParams.get("backfill") || "0", 10);

  try {
    if (!cached) {
      if (backfillDays > 0) {
        const dates = vnDateRange(Math.min(backfillDays, 90));
        const rows = await getOverviewRange(dates);
        await persistDailySales(rows);
      } else {
        const today = vnDateString();
        const row = await getOverview(today);
        await persistDailySales([row]);
      }
    }

    const daily = await readDailySales(30);
    const today = daily[daily.length - 1];

    return NextResponse.json({ ok: true, today: today || null, daily });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "FABi sync failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
