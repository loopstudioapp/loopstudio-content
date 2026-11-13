// Cron Triggers for the Cloudflare Worker. Each schedule calls the same
// route Vercel Cron called (vercel.json), as a GET with the same
// `Authorization: Bearer $CRON_SECRET` header Vercel sends. The routes keep
// validating CRON_SECRET themselves.
export const OWNER_HISTORY_BACKFILL_PATH = "/api/revenuecat?type=owner_history_backfill";
// One backfill call per month; within one cron run, call again while it says more months remain.
const BACKFILL_MAX_CALLS = 12;

export const CRON_JOBS: Record<string, string[]> = {
  // 00:05 UTC: OpenRouter 30-day cost reconciliation; new AskMed App Store
  // source files (Meta/organic revenue split), only days not saved yet
  "5 0 * * *": ["/api/openrouter-costs?refresh=1", "/api/appstore/askmed-channels?refresh=1"],
  // 16:00 UTC: Ket Coffee (FABi) sales sync for today; AskMed source files again
  "0 16 * * *": ["/api/fabi/sync", "/api/appstore/askmed-channels?refresh=1"],
  // 18:00 UTC: prior Vietnam day revenue reconciliation, one per owner app
  "0 18 * * *": [
    "/api/revenuecat?type=today_stats&app=GrailScan&reconcile=1",
    "/api/revenuecat?type=today_stats&app=AskMed&reconcile=1",
  ],
  // Hourly at :15: the owner page's numbers, so every day is saved to the permanent owner
  // history even when nobody opens the page; then the history backfill (repeated below while
  // months remain; only a status read once it is done).
  "15 * * * *": [
    "/api/revenuecat?type=today_stats&scope=owner&fast=1",
    OWNER_HISTORY_BACKFILL_PATH,
  ],
};

// Requests never leave Cloudflare (service binding or in-process), so the
// host only shapes request.url inside the routes.
export const CRON_ORIGIN = "https://content.loopstudio.tech";

export type CronResult = { path: string; status: number; ok: boolean; body: string };

export async function runCronJobs(
  cron: string,
  send: (request: Request) => Promise<Response>,
  secret: string | undefined,
): Promise<CronResult[]> {
  const paths = CRON_JOBS[cron];
  if (!paths) throw new Error(`No job for cron "${cron}"`);

  const headers: Record<string, string> = { "user-agent": "vercel-cron/1.0" };
  // Like Vercel: the header is only sent when CRON_SECRET is set.
  if (secret) headers.authorization = `Bearer ${secret}`;

  // Vercel ran same-time jobs as separate parallel invocations.
  return Promise.all(
    paths.map(async (path) => {
      try {
        let response: Response;
        let body = "";
        for (let call = 0; ; call++) {
          response = await send(new Request(`${CRON_ORIGIN}${path}`, { method: "GET", headers }));
          body = await response.text();
          if (path !== OWNER_HISTORY_BACKFILL_PATH || !response.ok || call + 1 >= BACKFILL_MAX_CALLS) break;
          let more = false;
          try { more = JSON.parse(body)?.more === true; } catch { more = false; }
          if (!more) break;
        }
        return { path, status: response.status, ok: response.ok, body: body.slice(0, 500) };
      } catch (error) {
        return { path, status: 0, ok: false, body: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}
