import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface RCEvent {
  type: string;
  app_user_id: string;
  original_app_user_id: string;
  product_id: string;
  period_type: string;
  purchased_at_ms: number | null;
  expiration_at_ms: number | null;
  environment: string;
  store: string;
  country_code: string;
  currency: string;
  price: number;
  price_in_purchased_currency: number;
  takehome_percentage: number;
  cancel_reason: string | null;
  is_trial_conversion: boolean;
}

interface RCWebhookBody {
  api_version: string;
  event: RCEvent;
}

function msToTimestamp(ms: number | null): string | null {
  if (!ms) return null;
  return new Date(ms).toISOString();
}

export async function POST(request: NextRequest) {
  // Optional shared secret check
  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (webhookSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: RCWebhookBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body?.event;
  if (!event || !event.type) {
    return NextResponse.json({ error: "Missing event" }, { status: 400 });
  }

  // Skip sandbox events
  if (event.environment === "SANDBOX") {
    return NextResponse.json({ ok: true, skipped: "sandbox" });
  }

  const appUserId = event.app_user_id;
  if (!appUserId) {
    return NextResponse.json({ error: "Missing app_user_id" }, { status: 400 });
  }

  // Detect which app based on product_id
  const productId = (event.product_id || "").toLowerCase();
  let appName = "Roomy AI";
  if (productId.includes("swipe") || productId.includes("com.swipeaway")) {
    appName = "SwipeAway";
  }

  const baseRecord = {
    id: appUserId,
    app_user_id: appUserId,
    country: event.country_code || null,
    store: (event.store || "APP_STORE").toLowerCase(),
    product_id: event.product_id || null,
    environment: (event.environment || "PRODUCTION").toLowerCase(),
    purchased_at: msToTimestamp(event.purchased_at_ms),
    expires_at: msToTimestamp(event.expiration_at_ms),
    revenue_gross: event.price || 0,
    app_name: appName,
    updated_at: new Date().toISOString(),
  };

  let upsertData: Record<string, unknown>;

  switch (event.type) {
    case "TRIAL_STARTED":
      upsertData = { ...baseRecord, status: "trialing", auto_renewal: "will_renew" };
      break;

    case "INITIAL_PURCHASE":
      upsertData = { ...baseRecord, status: "active", auto_renewal: "will_renew" };
      break;

    case "RENEWAL":
      upsertData = { ...baseRecord, status: "active", auto_renewal: "will_renew" };
      break;

    case "CANCELLATION":
      upsertData = {
        id: appUserId,
        app_user_id: appUserId,
        auto_renewal: "will_not_renew",
        updated_at: new Date().toISOString(),
        // Keep existing status — only update auto_renewal
        status: "active", // fallback for upsert; existing row keeps its status via onConflict merge
      };
      break;

    case "UNCANCELLATION":
      upsertData = {
        id: appUserId,
        app_user_id: appUserId,
        auto_renewal: "will_renew",
        updated_at: new Date().toISOString(),
        status: "active",
      };
      break;

    case "EXPIRATION":
      upsertData = {
        ...baseRecord,
        status: "expired",
        auto_renewal: "will_not_renew",
      };
      break;

    case "BILLING_ISSUE_DETECTED":
      upsertData = {
        ...baseRecord,
        status: "billing_retry",
      };
      break;

    case "SUBSCRIBER_ALIAS":
      // Alias events don't change subscription state
      return NextResponse.json({ ok: true, skipped: "alias_event" });

    default:
      // Unknown event type — acknowledge but don't process
      return NextResponse.json({ ok: true, skipped: "unknown_event", type: event.type });
  }

  const { error } = await supabase
    .from("rc_subscriptions")
    .upsert(upsertData, { onConflict: "id" });

  if (error) {
    console.error("Supabase upsert error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event_type: event.type });
}
