import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Simple cookie-based auth check.
 * Returns true if the request has an admin or employee_id cookie.
 */
function isAuthenticated(req: Request): boolean {
  const cookieHeader = req.headers.get("cookie") || "";
  const hasAdmin = /(?:^|;\s*)admin=/.test(cookieHeader);
  const hasEmployee = /(?:^|;\s*)employee_id=/.test(cookieHeader);
  return hasAdmin || hasEmployee;
}

/**
 * GET — list schedule entries for an account
 * Query: ?account_id=xxx
 */
export async function GET(req: Request) {
  if (!isAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id");

  if (!accountId) {
    return NextResponse.json({ error: "Missing account_id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("pinterest_schedule")
    .select("*")
    .eq("account_id", accountId)
    .order("scheduled_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/**
 * POST — start or stop an account's scheduler
 * Body: { account_id, action: "start" | "stop" }
 *
 * Start: sets running=true. The daily cron at 1AM VN will generate & schedule pins.
 * Stop: sets running=false. The cron will skip this account.
 */
export async function POST(req: Request) {
  if (!isAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { account_id, action } = body;

  if (!account_id || !action) {
    return NextResponse.json({ error: "Missing account_id or action" }, { status: 400 });
  }

  if (action === "start") {
    // Set running = true — the daily cron will pick it up
    const { error: updateErr } = await supabase
      .from("pinterest_accounts")
      .update({ running: true })
      .eq("id", account_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Get pins_per_day for the response
    const { data: account } = await supabase
      .from("pinterest_accounts")
      .select("pins_per_day")
      .eq("id", account_id)
      .single();

    const pinsPerDay = account?.pins_per_day || 5;

    return NextResponse.json({
      ok: true,
      action: "start",
      message: `Account will post ${pinsPerDay} pins daily. The cron runs at 1AM VN (6PM UTC).`,
    });
  }

  if (action === "stop") {
    // Set running = false
    const { error: updateErr } = await supabase
      .from("pinterest_accounts")
      .update({ running: false })
      .eq("id", account_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: "stop" });
  }

  return NextResponse.json({ error: "Invalid action. Use 'start' or 'stop'" }, { status: 400 });
}
