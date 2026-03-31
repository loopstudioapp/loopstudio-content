import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIntegrations } from "@/lib/pinterest/postbridge";

const POSTBRIDGE_API_KEY = process.env.POSTIZ_API_KEY;

export async function POST() {
  // Get API key from env or from existing accounts
  let apiKey = POSTBRIDGE_API_KEY;

  if (!apiKey) {
    // Fall back to first account's API key
    const { data: existing } = await supabase
      .from("pinterest_accounts")
      .select("postiz_api_key")
      .limit(1)
      .single();
    apiKey = existing?.postiz_api_key;
  }

  if (!apiKey) {
    return NextResponse.json({ error: "No PostBridge API key configured" }, { status: 400 });
  }

  try {
    // Fetch Pinterest accounts from PostBridge
    const accounts = await getIntegrations(apiKey);

    // Sync each account to our DB
    for (const account of accounts) {
      const accountId = String(account.id);

      const { data: existing } = await supabase
        .from("pinterest_accounts")
        .select("id")
        .eq("postiz_integration_id", accountId)
        .single();

      if (!existing) {
        // Create new account
        await supabase.from("pinterest_accounts").insert({
          name: account.username || "Pinterest",
          pinterest_username: account.username || null,
          postiz_api_key: apiKey,
          postiz_integration_id: accountId,
          board_id: "auto",
          content_type: "visual_guide",
          status: "active",
          pins_per_day: 5,
          app_store_url: "https://apps.apple.com/us/app/interior-design-roomy-ai/id6759851023?ct=pinterest&mt=8",
        });
      } else {
        // Update existing — sync name
        await supabase
          .from("pinterest_accounts")
          .update({
            name: account.username || "Pinterest",
            pinterest_username: account.username || null,
          })
          .eq("id", existing.id);
      }
    }

    return NextResponse.json({ ok: true, accounts });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
