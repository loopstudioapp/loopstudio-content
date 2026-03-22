import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const integrationId = searchParams.get("integration_id");
  const days = searchParams.get("days") || "7";

  if (!integrationId) {
    return NextResponse.json({ error: "Missing integration_id" }, { status: 400 });
  }

  // Find the account to get the Postiz API key
  const { data: account } = await supabase
    .from("pinterest_accounts")
    .select("postiz_api_key")
    .eq("postiz_integration_id", integrationId)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    const res = await fetch(
      `https://api.postiz.com/public/v1/analytics/${integrationId}?date=${days}`,
      { headers: { Authorization: account.postiz_api_key } }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Postiz error: ${text}` }, { status: res.status });
    }

    const data = await res.json();
    const filtered = Array.isArray(data) ? data.filter((m: { label: string }) => m.label !== "Engagement") : data;
    return NextResponse.json(filtered);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to fetch analytics";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
