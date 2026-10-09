// Cron Triggers for the Cloudflare Worker. Each schedule calls the same
// route Vercel Cron called (vercel.json), as a GET with the same
// `Authorization: Bearer $CRON_SECRET` header Vercel sends. The routes keep
// validating CRON_SECRET themselves.
export const CRON_JOBS: Record<string, string[]> = {
  // 00:00 UTC: RevenueCat summary to Telegram
  "0 0 * * *": ["/api/cron/pull-metrics"],
  // 00:05 UTC: OpenRouter 30-day cost reconciliation
  "5 0 * * *": ["/api/openrouter-costs?refresh=1"],
  // 16:00 UTC: Ket Coffee (FABi) sales sync for today
  "0 16 * * *": ["/api/fabi/sync"],
  // 18:00 UTC: prior Vietnam day revenue reconciliation, one per owner app
  "0 18 * * *": [
    "/api/revenuecat?type=today_stats&app=GrailScan&reconcile=1",
    "/api/revenuecat?type=today_stats&app=AskMed&reconcile=1",
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
        const response = await send(new Request(`${CRON_ORIGIN}${path}`, { method: "GET", headers }));
        const body = (await response.text()).slice(0, 500);
        return { path, status: response.status, ok: response.ok, body };
      } catch (error) {
        return { path, status: 0, ok: false, body: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}
