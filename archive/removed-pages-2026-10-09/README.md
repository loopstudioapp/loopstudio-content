# Pages retired on 2026-10-09

The owner no longer needs these pages and their functions. They stay live on Vercel until content.loopstudio.tech moves to Cloudflare, and they are **not** ported. The full code is preserved at git tag `archive/before-cloudflare-2026-10-09` (commit c66d5c5). Restore any file with:

```bash
git checkout archive/before-cloudflare-2026-10-09 -- <path>
```

Screenshots of each page (taken 2026-10-09 from a local run against the live Supabase data; Kien's PIN is hidden) are in `screenshots/`.

| Page | What it was | Code |
| --- | --- | --- |
| `/dashboard` | Staff home: their TikTok/Lemon8 accounts by angle, followers, likes, posts | `app/dashboard/page.tsx` |
| `/dashboard/account/[id]` | One account: device, login, app, the "Generate Content & Send to Telegram" generator (3 a day), TikTok and Lemon8 stats and metrics history | `app/dashboard/account/[id]/page.tsx`, `components/ContentGenerator.tsx`, `app/api/generate-content`, `lib/generate-prompts.ts`, `lib/prompts` |
| `/tutorial` | "How to Post Content", 8 steps | `app/tutorial/page.tsx`, `components/Tutorial.tsx` |
| `/prompt` | Prompt Generator: title, description, base and transform prompts for ChatGPT | `app/prompt/page.tsx`, `components/PromptGenerator.tsx` |
| `/owner/accounts` | Manage employees and TikTok/Lemon8 accounts | `app/owner/accounts/page.tsx`, `app/api/accounts`, `app/api/employees` (the staff login on `/` still reads the employees table) |
| `/owner/tiktok` | Owner overview of all TikTok/Lemon8 accounts with totals | `app/owner/tiktok/page.tsx`, `app/api/metrics`, `app/api/scrape-metrics` |
| `/owner/pinterest` | Pinterest automation: 10 accounts, schedule, pin history, analytics | `app/owner/pinterest/page.tsx`, `app/api/pinterest/*`, `app/api/cron/pinterest-pipeline`, `app/api/cron/pinterest-retry`, `lib/pinterest` |
| `/food` | "Food memory": should I eat this, photo analysis with remembered rules | `app/food/page.tsx`, `app/api/food/*`, `lib/food.ts`, `lib/food-memory-store.ts`, `lib/openrouter-food.ts` |

Scheduled jobs that only served these pages: `post-reminder` (01:00, 09:00, 14:00 UTC Telegram posting reminders), `pinterest-pipeline` (18:00), `pinterest-retry` (19:00). `pull-metrics` (00:00) mixes TikTok/Lemon8/Pinterest metrics with a RevenueCat summary in one Telegram report.
