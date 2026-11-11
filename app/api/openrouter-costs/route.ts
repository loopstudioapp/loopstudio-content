import { NextRequest, NextResponse } from "next/server";
import {
  readOpenRouterDailyCosts,
  readOpenRouterError,
  reconcileOpenRouterDailyCosts,
  saveOpenRouterError,
  utcDateWindow,
} from "@/lib/openrouter/costs";

export const maxDuration = 60;

const APP_NAME = "GrailScan";

export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  if (
    forceRefresh &&
    (!process.env.CRON_SECRET ||
      request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
  ) {
    return NextResponse.json({ error: "Unauthorized OpenRouter reconciliation" }, { status: 401 });
  }

  const dates = utcDateWindow(30);
  try {
    const result = forceRefresh
      ? await reconcileOpenRouterDailyCosts(dates, APP_NAME)
      : await readOpenRouterDailyCosts(APP_NAME, dates);
    const costsByDate = result.costsByDate;
    const lastError = await readOpenRouterError(APP_NAME).catch(() => null);

    return NextResponse.json({
      last_error: lastError,
      app: APP_NAME,
      costs_by_date: costsByDate,
      total: Object.values(costsByDate).reduce((sum, cost) => sum + cost, 0),
      updated_at: result.updatedAt,
      reconciled: forceRefresh,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenRouter cost refresh failed";
    if (forceRefresh) await saveOpenRouterError(APP_NAME, error);
    try {
      const saved = await readOpenRouterDailyCosts(APP_NAME, dates);
      if (Object.keys(saved.costsByDate).length > 0) {
        return NextResponse.json({
          app: APP_NAME,
          costs_by_date: saved.costsByDate,
          total: Object.values(saved.costsByDate).reduce((sum, cost) => sum + cost, 0),
          updated_at: saved.updatedAt,
          stale: true,
          refresh_error: message,
        });
      }
    } catch {
      // Return the source error below when neither source nor cache is available.
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
