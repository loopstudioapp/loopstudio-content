import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Completion is per occurrence, not per task: marking a recurring task done on
 * one date leaves every other date it recurs on untouched.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const taskId = String(body.task_id || "");
  const date = String(body.occurrence_date || "");

  if (!taskId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "task_id and occurrence_date are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("calendar_task_completions")
    .upsert(
      { task_id: taskId, occurrence_date: date, completed_at: new Date().toISOString() },
      { onConflict: "task_id,occurrence_date" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Undo a completion so the occurrence returns to the queue. */
export async function DELETE(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("task_id");
  const date = request.nextUrl.searchParams.get("occurrence_date");

  if (!taskId || !date) {
    return NextResponse.json({ error: "task_id and occurrence_date are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("calendar_task_completions")
    .delete()
    .eq("task_id", taskId)
    .eq("occurrence_date", date);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
