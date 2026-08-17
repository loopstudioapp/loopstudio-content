# Loop Studio Website Agent Handoff

Read this before changing `/owner`, GrailScan analytics, Meta integrations, or billing data.

## Repository And Release

- Repository: `loopstudioapp/loopstudio-content`, branch `main`.
- Production: `https://content.loopstudio.tech`; owner dashboard: `/owner`.
- Vercel project: `loopstudio-content`.
- After a verified code change, create a scoped commit with a descriptive body, push `main`, deploy production, and verify the production API/UI. Never commit credentials, `.DS_Store`, or `tsconfig.tsbuildinfo` noise.
- Latest architecture change as of 2026-08-17: commit `c7c6f1a` separates OpenRouter reconciliation from RevenueCat.

## Owner Dashboard Scope

- `/owner` intentionally displays GrailScan only for subscription/app metrics. Do not add Roomy AI, SwipeAway, or unrelated app data to those calculations.
- Ket Coffee (`/api/fabi/sync`) and Game Studio are intentionally retained as independent owner-dashboard sections; never mix either into GrailScan revenue, subscriptions, or profit.
- Frontend: `app/owner/page.tsx`.
- Dashboard API: `app/api/revenuecat/route.ts` with `app=GrailScan`.
- The endpoint name is historical: it now composes RevenueCat revenue, Meta spend, refunds, and operating costs.
- Dates and daily revenue/Meta buckets use `Asia/Ho_Chi_Minh` (GMT+7). OpenRouter activity remains on its official UTC dates.

## Existing Data Sources

### RevenueCat

- RevenueCat webhooks are handled by `app/api/webhooks/revenuecat/route.ts`.
- Current subscription summaries are stored in `rc_subscriptions`.
- Immutable renewal/refund events are stored in `rc_renewal_events`.
- Normal dashboard refreshes use these Supabase tables and do not rebuild the RevenueCat transaction ledger.
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

- Apple commission defaults to 15% via `APPLE_COMMISSION_RATE`.
- Meta VAT is 10%.
- RevenueCat cost is 1% when tracked 30-day revenue exceeds the configured free MTR threshold of `$2,500`.
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
- Test provider failure fallback and duplicate-event/idempotency behavior.
- Reconcile dashboard totals against source APIs before declaring financial calculations correct.
- Production checks must avoid the RevenueCat `refresh=1` ledger rebuild unless the task specifically requires RevenueCat reconciliation.
