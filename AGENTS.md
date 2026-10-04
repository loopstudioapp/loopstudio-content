# Loop Studio Website Agent Handoff

Read this before changing `/owner`, GrailScan analytics, Meta integrations, or billing data.

## Repository And Release

- Repository: `loopstudioapp/loopstudio-content`, branch `main`.
- Production: `https://content.loopstudio.tech`; owner dashboard: `/owner`.
- Vercel project: `loopstudio-content`.
- After a verified code change, create a scoped commit with a descriptive body, push `main`, deploy production, and verify the production API/UI. Never commit credentials, `.DS_Store`, or `tsconfig.tsbuildinfo` noise.
- Latest architecture change as of 2026-08-17: commit `c7c6f1a` separates OpenRouter reconciliation from RevenueCat.

## Owner Dashboard Scope

- `/owner` combines GrailScan and AskMed revenue, subscribers, profit and shared costs. Only their summary cards and Today Subscriptions tables stay separate. Revenue and new-subscriber charts stack both apps with separate legends/tooltips. Roomy AI and SwipeAway remain hidden.
- AskMed uses server-only `REVENUECAT_ASKMED_API_KEY` and `REVENUECAT_ASKMED_PROJECT_ID`; project `proj9d9ff47f`, App Store bundle `com.loopstudio.askmed`, Apple ID `6776077826`. Its production webhook is `/api/webhooks/revenuecat?app=askmed`, authenticated with a dedicated `REVENUECAT_ASKMED_WEBHOOK_SECRET` bearer token. AskMed subscription storage IDs are prefixed `AskMed:` to avoid cross-app collisions.
- AskMed uses the same cached/fast dashboard and protected historical refresh paths with `app=AskMed`. Import existing subscriptions with protected `POST /api/revenuecat/sync?app=AskMed`. The individual app snapshots remain isolated source ledgers. Meta, OpenRouter and Higgsfield are shared infrastructure: read their existing GrailScan-keyed provider ledger once for combined owner accounting; do not duplicate or allocate another copy to AskMed.
- Ket Coffee (`/api/fabi/sync`) and Game Studio are intentionally retained as independent owner-dashboard sections; never mix either into GrailScan revenue, subscriptions, or profit.
- Frontend: `app/owner/page.tsx`.
- Dashboard API: `app/api/revenuecat/route.ts` with `scope=owner`. This composes only GrailScan and AskMed through existing cached/fast per-app paths, with accounting in `lib/revenuecat/owner.ts`. Legacy individual app endpoints remain unchanged. Missing/stale source snapshots must not silently become zero or partial combined revenue.
- The endpoint name is historical: it now composes RevenueCat revenue, Meta spend, refunds, and operating costs.
- Dates and daily revenue/Meta buckets use `Asia/Ho_Chi_Minh` (GMT+7). OpenRouter activity remains on its official UTC dates.

## Existing Data Sources

### RevenueCat

- RevenueCat webhooks are handled by `app/api/webhooks/revenuecat/route.ts`.
- Current subscription summaries are stored in `rc_subscriptions`.
- Immutable renewal/refund events are stored in `rc_renewal_events`.
- Normal dashboard refreshes use these Supabase tables and do not rebuild the RevenueCat transaction ledger.
- Revenue reconciliation runs once daily for each owner app at `0 18 * * *` UTC (1 AM Vietnam; Hobby scheduling may run within that hour), replacing the former pre-midnight fast-cache cron. The authenticated `/api/revenuecat?type=today_stats&app=AskMed|GrailScan&reconcile=1` checks the prior Vietnam day. `days=30` is a manual, authenticated one-time repair, never a recurring 30-day scan.
- Nightly reconciliation reads RevenueCat events for every production subscriber registered in `rc_subscriptions`, including cancelled/expired customers, with pagination and per-project rate limiting. It does not scan nonpaying installs. Renewals missed by webhooks are recovered for known subscribers; a completely unknown customer whose initial-purchase webhook never arrived requires the explicit full-discovery maintenance path.
- Corrected daily revenue/new-subscriber/refund values are saved atomically under `__rc_reconciled_day__:APP:DATE` in `pinterest_topics`, separate from fast dashboard snapshots, and overlaid on all cached/fast responses. Provider costs and today's live transactions remain unchanged. This prevents later fast refreshes from overwriting corrected history. `__rc_reconciliation_run__:APP` tracks running/completed/failed status; duplicate completed cron runs skip, failures retain saved numbers and surface `reconciliation_warning` in web/iOS.
- The one-day GrailScan job also closes yesterday's shared Meta spend once, with the existing 10% VAT rule, replacing the bookkeeping formerly done by the pre-midnight fast cron. AskMed never duplicates this fetch/cost. A provider failure omits this correction and preserves the saved cost. The one-time 30-day revenue repair does not change provider costs.
- To explicitly repeat a completed reconciliation after late-reported transactions, an authenticated operator can add `force=1` to the reconciliation request. Cron never uses force. A successful legacy full-discovery `refresh=1` also replaces historical corrections so the overlay cannot hide newly discovered transactions.
- A protected `refresh=1` request is the slow maintenance path that fetches/rebuilds the full 30-day RevenueCat ledger. Do not call it for unrelated provider updates.
- Dashboard snapshots are stored in `pinterest_topics` under `__rc_today_stats_cache__:GrailScan`.
- Same-day weekly-to-yearly upgrades count as one new subscription; later upgrades count as renewals.
- Refund rows are stored in the backend but excluded from the Today Subscriptions table.

### Meta Spend

- `lib/meta/ads.ts` is a read-only Meta Marketing API spend client. It is not attribution or Conversions API tracking.
- It uses `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, and optional `META_AD_ACCOUNT_CURRENCY` from server environment variables.
- Current Graph API version in code is `v21.0`.
- Spend uses the ad account's daily timezone, is converted to USD using `open.er-api.com`, and receives 10% Meta VAT in profit calculations.
- A Meta outage preserves valid same-day cached spend when available and marks it stale; it must not silently replace known spend with zero.

### OpenRouter

- Implementation: `lib/openrouter/costs.ts` and `app/api/openrouter-costs/route.ts`.
- One independent Supabase cache row is stored per provider/app/date in `pinterest_topics`, keyed as `__openrouter_daily_cost__:GrailScan:YYYY-MM-DD`.
- Normal dashboard refresh fetches only current OpenRouter key usage. It does not fetch activity history or touch the RevenueCat ledger.
- Protected daily reconciliation runs at `00:05 UTC` (`07:05 Vietnam`) and updates only the 30 OpenRouter rows.
- Failed OpenRouter requests preserve the last complete saved values.
- The first production reconciliation on 2026-08-17 saved 30 nonzero days totaling about `$199.43`; this number naturally changes over time.

## Profit And Chart Rules

- Owner profit uses Apple's real proceeds share, not a flat 15%: `lib/appstore/proceeds.ts` reads App Store Connect Sales Reports (`ASC_SALES_KEY_ID`, `ASC_SALES_ISSUER_ID`, `ASC_SALES_PRIVATE_KEY`, `ASC_VENDOR_NUMBER`). Each app/Vietnam day uses proceeds ÷ customer price over the trailing 14 report days (refunds included). Settled reports are cached permanently as `__asc_sales_report__:DAILY|MONTHLY:DATE` and the summary (per-day shares, 2026 YTD proceeds in USD/VND) as `__asc_proceeds_summary__` in `pinterest_topics`, refreshed when older than 12 h. A failed refresh keeps the last summary, then falls back to 0.85. Per-app endpoints still use `APPLE_COMMISSION_RATE` (default 15%).
- The owner tax toggle is Vietnam personal tax only: Auto picks 0/15/17/20% from YTD Apple proceeds across all apps (≤₫500M, ≤₫3B, ≤₫50B, above) and applies it flat to a period's total profit; a manual rate is remembered per device.
- Meta VAT is 10%.
- RevenueCat cost is 1% when tracked 30-day revenue exceeds the configured free MTR threshold of `$2,500`; owner accounting evaluates that threshold once on combined GrailScan + AskMed net revenue.
- Higgsfield is `$50/month`, distributed evenly over 30 days.
- Net refunds are displayed as a cost and distributed evenly across the 30-day period. Revenue bars remain gross purchase revenue; profit subtracts the distributed refund cost.
- Daily profit formula is revenue after distributed refunds, less Apple commission, Meta spend including VAT, RevenueCat cost, OpenRouter cost, and Higgsfield cost.
- The headline Total Profit must equal the current day's fully costed profit chart point.
- Independent provider reconciliation should overlay only that provider's cost delta. It must not refetch or mutate unrelated ledgers.

## Meta Attribution / Facebook Tracking Boundary

The current system has Meta spend reporting only. Server-side attribution and Meta Conversions API are new work and should be implemented separately.

- Keep `lib/meta/ads.ts` focused on spend reads. Add separate modules/routes for attribution ingestion and CAPI delivery.
- Add dedicated Supabase migrations/tables for attribution identities/touches, app events, and CAPI delivery attempts. Do not store attribution records in `pinterest_topics`, `rc_subscriptions`, or `rc_renewal_events`.
- Correlate attribution with RevenueCat using GrailScan's stable `app_user_id`. Preserve raw source timestamps in UTC and derive Vietnam reporting dates separately.
- Require an idempotent client/server `event_id`; enforce unique constraints so retries cannot double-count purchases or Meta events.
- Store campaign/ad/ad-set identifiers and available Meta click/browser identifiers separately from the subscription ledger. Never treat Meta's reported conversions as financial revenue truth; RevenueCat remains the purchase/refund source of truth.
- Send Meta credentials only from server-side environment variables. Never expose access tokens in the iOS app, browser bundle, repository, logs, or API responses.
- Queue CAPI delivery with retry status and retain request metadata needed for diagnostics without storing unnecessary personal data. Hash required customer fields according to Meta's current official specification.
- Before implementation, confirm the exact GrailScan client events and identifiers available, the Meta Pixel/dataset ID, desired attribution window, ATT consent behavior, and whether purchase events should be emitted from the RevenueCat webhook or from a server worker.
- Keep attribution processing independent so Meta failures cannot block RevenueCat webhooks, owner dashboard refreshes, or subscription access.

## Verification Expectations

- Run `npx tsc --noEmit` and `npm run build` for dashboard/API changes.
- Run `node --test tests/askmed-revenue.test.cjs` for AskMed isolation, plan mapping, authentication and webhook routing checks. Local data imports must use the server Supabase service-role key, not the browser anon key; inspect sync errors before claiming an import succeeded.
- Test provider failure fallback and duplicate-event/idempotency behavior.
- Reconcile dashboard totals against source APIs before declaring financial calculations correct.
- Production checks must avoid the RevenueCat `refresh=1` ledger rebuild unless the task specifically requires RevenueCat reconciliation.
