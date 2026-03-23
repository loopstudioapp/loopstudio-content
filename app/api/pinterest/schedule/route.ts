import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateRandomTimes } from "@/lib/pinterest/scheduler";

/**
 * GET — list schedule entries for an account
 * Query: ?account_id=xxx
 */
export async function GET(req: Request) {
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
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { account_id, action } = body;

  if (!account_id || !action) {
    return NextResponse.json({ error: "Missing account_id or action" }, { status: 400 });
  }

  if (action === "start") {
    // Set running = true
    const { error: updateErr } = await supabase
      .from("pinterest_accounts")
      .update({ running: true })
      .eq("id", account_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Generate 5 random times for today (2hr+ apart)
    const today = new Date();
    const now = Date.now();
    const times = generateRandomTimes(5, today, 120); // 120 min = 2 hours

    // Filter out times that have already passed
    const futureTimes = times.filter((t) => t.getTime() > now);

    if (futureTimes.length === 0) {
      // All today's times have passed — generate for tomorrow instead
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowTimes = generateRandomTimes(5, tomorrow, 120);

      const inserts = tomorrowTimes.map((t) => ({
        account_id,
        scheduled_at: t.toISOString(),
        status: "pending" as const,
      }));

      const { error: insertErr } = await supabase
        .from("pinterest_schedule")
        .insert(inserts);

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        action: "start",
        scheduled_count: tomorrowTimes.length,
        note: "All today slots passed, scheduled for tomorrow",
        times: tomorrowTimes.map((t) => t.toISOString()),
      });
    }

    // Insert future times for today
    const inserts = futureTimes.map((t) => ({
      account_id,
      scheduled_at: t.toISOString(),
      status: "pending" as const,
    }));

    const { error: insertErr } = await supabase
      .from("pinterest_schedule")
      .insert(inserts);

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      action: "start",
      scheduled_count: futureTimes.length,
      times: futureTimes.map((t) => t.toISOString()),
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

    // Mark all pending schedule entries as skipped
    const { error: skipErr } = await supabase
      .from("pinterest_schedule")
      .update({ status: "skipped" })
      .eq("account_id", account_id)
      .eq("status", "pending");

    if (skipErr) {
      return NextResponse.json({ error: skipErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: "stop" });
  }

  return NextResponse.json({ error: "Invalid action. Use 'start' or 'stop'" }, { status: 400 });
}
