import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 300; // allow up to 5 minutes for full sync

const RC_BASE = "https://api.revenuecat.com/v2";

function rcHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function msToTimestamp(ms: number | null | undefined): string | null {
  if (!ms) return null;
  return new Date(ms).toISOString();
}

export async function POST() {
  const apiKey = process.env.REVENUECAT_API_KEY;
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  if (!apiKey || !projectId) {
    return NextResponse.json(
      { error: "REVENUECAT_API_KEY and REVENUECAT_PROJECT_ID must be set" },
      { status: 500 }
    );
  }

  let cursor: string | undefined;
  let totalCustomers = 0;
  let totalSubs = 0;
  let errors = 0;

  try {
    let hasMore = true;
    while (hasMore) {
      const url = new URL(`${RC_BASE}/projects/${projectId}/customers`);
      url.searchParams.set("limit", "50");
      if (cursor) url.searchParams.set("starting_after", cursor);

      const res = await fetch(url.toString(), { headers: rcHeaders(apiKey) });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Customers API error ${res.status}`, synced: totalSubs },
          { status: 500 }
        );
      }

      const json = await res.json();
      const items: { id: string; last_seen_country?: string }[] = json.items || [];
      if (items.length === 0) break;

      // Process in batches of 5 to respect rate limits
      for (let bi = 0; bi < items.length; bi += 5) {
        const batch = items.slice(bi, bi + 5);

        const batchResults = await Promise.all(
          batch.map(async (c) => {
            const encoded = encodeURIComponent(c.id);
            for (let attempt = 0; attempt < 3; attempt++) {
              const subRes = await fetch(
                `${RC_BASE}/projects/${projectId}/customers/${encoded}/subscriptions`,
                { headers: rcHeaders(apiKey) }
              );
              if (subRes.status === 429) {
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                continue;
              }
              if (!subRes.ok) return [];
              const subJson = await subRes.json();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (subJson.items || []).map((s: any) => ({
                customerId: c.id,
                customerCountry: c.last_seen_country || "",
                ...s,
              }));
            }
            return [];
          })
        );

        for (const subs of batchResults) {
          for (const sub of subs) {
            const env = (sub.environment || "").toLowerCase();
            if (env === "sandbox") continue;

            const status = (sub.status || "").toLowerCase();
            const autoRenewal = (sub.auto_renewal_status || "").toLowerCase();

            const record = {
              id: sub.customerId,
              app_user_id: sub.customerId,
              country: (sub.country || sub.customerCountry || "").toUpperCase() || null,
              store: (sub.store || "app_store").toLowerCase(),
              product_id: sub.product_id || null,
              status,
              auto_renewal: autoRenewal || null,
              environment: env,
              purchased_at: msToTimestamp(sub.starts_at),
              expires_at: msToTimestamp(sub.current_period_ends_at),
              revenue_gross: sub.total_revenue_in_usd?.gross ?? sub.total_revenue_in_usd?.proceeds ?? 0,
              updated_at: new Date().toISOString(),
            };

            const { error } = await supabase
              .from("rc_subscriptions")
              .upsert(record, { onConflict: "id" });

            if (error) {
              console.error("Sync upsert error:", error, "for", sub.customerId);
              errors++;
            } else {
              totalSubs++;
            }
          }
        }

        // Small delay between batches
        if (bi + 5 < items.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      totalCustomers += items.length;
      cursor = items[items.length - 1]?.id;
      hasMore = !!json.next_page;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message, synced: totalSubs, customers_checked: totalCustomers, errors },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    customers_checked: totalCustomers,
    subscriptions_synced: totalSubs,
    errors,
  });
}
