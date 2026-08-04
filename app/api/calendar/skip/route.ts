import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SETUP_HINT =
  "Skips are not set up yet. Run supabase/migrations/20260804_calendar_task_skips.sql in the Supabase SQL editor.";

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message || "")
  );
}

/**
 * Drop a single occurrence of a recurring task without touching its schedule.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const taskId = String(body.task_id || "");
  const date = String(body.occurrence_date || "");

  if (!taskId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "task_id and occurrence_date are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("calendar_task_skips")
    .upsert({ task_id: taskId, occurrence_date: date }, { onConflict: "task_id,occurrence_date" });

  if (error) {
    const missing = isMissingTable(error);
    return NextResponse.json(
      { error: missing ? SETUP_HINT : error.message, setup_required: missing },
      { status: missing ? 503 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

/** Put a skipped occurrence back on the calendar. */
export async function DELETE(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("task_id");
  const date = request.nextUrl.searchParams.get("occurrence_date");

  if (!taskId || !date) {
    return NextResponse.json({ error: "task_id and occurrence_date are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("calendar_task_skips")
    .delete()
    .eq("task_id", taskId)
    .eq("occurrence_date", date);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
