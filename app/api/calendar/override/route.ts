import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SETUP_HINT =
  "Recurring task moves are not set up yet. Run supabase/migrations/20260810_calendar_task_overrides.sql in the Supabase SQL editor.";

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message || "")
  );
}

/** Move one recurring occurrence without changing its parent schedule. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const taskId = String(body.task_id || "");
  const occurrenceDate = String(body.occurrence_date || "");
  const displayDate = String(body.display_date || "");
  const startTime = String(body.start_time || "");

  if (
    !taskId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(displayDate) ||
    !/^\d{2}:\d{2}$/.test(startTime)
  ) {
    return NextResponse.json(
      { error: "task_id, occurrence_date, display_date, and start_time are required" },
      { status: 400 },
    );
  }

  const task = await supabase
    .from("calendar_tasks")
    .select("id, recurrence")
    .eq("id", taskId)
    .is("deleted_at", null)
    .single();

  if (task.error) return NextResponse.json({ error: task.error.message }, { status: 404 });
  if (task.data.recurrence === "none") {
    return NextResponse.json({ error: "Only recurring tasks can have occurrence overrides" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("calendar_task_overrides")
    .upsert(
      {
        task_id: taskId,
        occurrence_date: occurrenceDate,
        display_date: displayDate,
        start_time: startTime,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "task_id,occurrence_date" },
    )
    .select("task_id, occurrence_date, display_date, start_time")
    .single();

  if (error) {
    const missing = isMissingTable(error);
    return NextResponse.json(
      { error: missing ? SETUP_HINT : error.message, setup_required: missing },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({ override: data });
}

/** Restore one occurrence to the parent recurring schedule. */
export async function DELETE(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("task_id");
  const occurrenceDate = request.nextUrl.searchParams.get("occurrence_date");

  if (!taskId || !occurrenceDate) {
    return NextResponse.json({ error: "task_id and occurrence_date are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("calendar_task_overrides")
    .delete()
    .eq("task_id", taskId)
    .eq("occurrence_date", occurrenceDate);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
