import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY;

export async function POST() {
  // Get API key from env or from existing accounts
  let apiKey = POSTIZ_API_KEY;

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
    return NextResponse.json({ error: "No Postiz API key configured" }, { status: 400 });
  }

  try {
    // Fetch integrations from Postiz
    const res = await fetch("https://api.postiz.com/public/v1/integrations", {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch from Postiz" }, { status: 500 });
    }

    const integrations = await res.json();

    // Filter Pinterest integrations only
    const pinterestIntegrations = integrations.filter(
      (i: { identifier: string }) => i.identifier === "pinterest"
    );

    // Sync each integration to our DB
    for (const integration of pinterestIntegrations) {
      const { data: existing } = await supabase
        .from("pinterest_accounts")
        .select("id")
        .eq("postiz_integration_id", integration.id)
        .single();

      if (!existing) {
        // Create new account
        await supabase.from("pinterest_accounts").insert({
          name: integration.name || integration.profile || "Pinterest",
          pinterest_username: integration.profile || null,
          postiz_api_key: apiKey,
          postiz_integration_id: integration.id,
          board_id: "auto",
          content_type: "visual_guide",
          status: integration.disabled ? "paused" : "active",
          pins_per_day: 5,
          app_store_url: "https://apps.apple.com/app/roomy-ai",
        });
      } else {
        // Update existing — sync status
        await supabase
          .from("pinterest_accounts")
          .update({
            name: integration.name || integration.profile || "Pinterest",
            pinterest_username: integration.profile || null,
            status: integration.disabled ? "paused" : "active",
          })
          .eq("id", existing.id);
      }
    }

    return NextResponse.json({ ok: true, integrations: pinterestIntegrations });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
