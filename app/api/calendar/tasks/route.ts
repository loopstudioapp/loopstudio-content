import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SETUP_HINT = "Calendar tables are missing. Run supabase/migrations/20260804_calendar_tasks.sql in the Supabase SQL editor.";
const COLUMN_HINT = "The calendar schema is out of date. Run the newest file in supabase/migrations/ in the Supabase SQL editor.";

/** PostgREST reports an unmigrated column as a schema-cache miss. */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST204" || /could not find the '.+' column/i.test(error.message || "");
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // 42P01 is Postgres direct; PGRST205 is PostgREST's "not in the schema cache".
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message || "")
  );
}

/** Keep only the fields that belong to the task's recurrence mode. */
function buildRow(body: Record<string, unknown>) {
  const recurrence = ["none", "weekly", "monthly", "yearly"].includes(String(body.recurrence))
    ? String(body.recurrence)
    : "none";

  const priority = Math.min(10, Math.max(1, Number(body.priority) || 5));
  const estimate = Math.max(1, Number(body.estimate_minutes) || 30);
  const category = ["music", "app", "other"].includes(String(body.category))
    ? String(body.category)
    : "other";

  const row: Record<string, unknown> = {
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    image_url: body.image_url ? String(body.image_url) : null,
    priority,
    category,
    estimate_minutes: estimate,
    recurrence,
    // Anytime tasks keep whatever time fields they have; they are simply never
    // read, which means toggling a task back to timed restores its old time.
    timed: body.timed !== false,
    start_date: body.start_date ? String(body.start_date) : null,
    start_time: body.start_time ? String(body.start_time) : "09:00",
    weekly_times: {},
    monthly_day: null,
    yearly_month: null,
    yearly_day: null,
  };

  if (recurrence === "weekly") {
    const times = (body.weekly_times || {}) as Record<string, string>;
    const clean: Record<string, string> = {};
    for (const day of ["0", "1", "2", "3", "4", "5", "6"]) {
      const value = times[day];
      if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value)) clean[day] = value;
    }
    row.weekly_times = clean;
  } else if (recurrence === "monthly") {
    row.monthly_day = Math.min(31, Math.max(1, Number(body.monthly_day) || 1));
  } else if (recurrence === "yearly") {
    row.yearly_month = Math.min(12, Math.max(1, Number(body.yearly_month) || 1));
    row.yearly_day = Math.min(31, Math.max(1, Number(body.yearly_day) || 1));
  }

  if (body.pin_first === true) row.pin_first = true;

  return row;
}

/** GET /api/calendar/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  const tasksQuery = await supabase
    .from("calendar_tasks")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (tasksQuery.error) {
    const missing = isMissingTable(tasksQuery.error);
    return NextResponse.json(
      { error: missing ? SETUP_HINT : tasksQuery.error.message, setup_required: missing },
      { status: missing ? 503 : 500 },
    );
  }

  let completionsQuery = supabase
    .from("calendar_task_completions")
    .select("task_id, occurrence_date");
  if (from) completionsQuery = completionsQuery.gte("occurrence_date", from);
  if (to) completionsQuery = completionsQuery.lte("occurrence_date", to);

  const completions = await completionsQuery;
  if (completions.error) {
    return NextResponse.json({ error: completions.error.message }, { status: 500 });
  }

  const rows = [...(completions.data || [])];

  // A carried-over one-off is completed against the date it was originally
  // scheduled for, which is by definition outside the window being viewed.
  // Without these rows the client cannot tell it is finished and would keep
  // rolling it forward forever. One-offs have at most one completion each, so
  // this stays bounded.
  const oneOffIds = (tasksQuery.data || [])
    .filter((task) => task.recurrence === "none")
    .map((task) => task.id);

  if (oneOffIds.length) {
    const carried = await supabase
      .from("calendar_task_completions")
      .select("task_id, occurrence_date")
      .in("task_id", oneOffIds);
    if (carried.error) {
      return NextResponse.json({ error: carried.error.message }, { status: 500 });
    }
    rows.push(...(carried.data || []));
  }

  // Skips are only ever set on recurring tasks, whose occurrence date always
  // falls inside the window being viewed, so a plain range filter is enough.
  let skipsQuery = supabase.from("calendar_task_skips").select("task_id, occurrence_date");
  if (from) skipsQuery = skipsQuery.gte("occurrence_date", from);
  if (to) skipsQuery = skipsQuery.lte("occurrence_date", to);
  const skips = await skipsQuery;

  return NextResponse.json({
    tasks: tasksQuery.data || [],
    completions: [...new Set(rows.map((c) => `${c.task_id}:${c.occurrence_date}`))],
    // Missing table just means the migration has not been run; skips are additive.
    skips: skips.error ? [] : (skips.data || []).map((s) => `${s.task_id}:${s.occurrence_date}`),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const row = buildRow(body);
  if (!row.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const { data, error } = await supabase.from("calendar_tasks").insert(row).select().single();
  if (error) {
    const missing = isMissingTable(error) || isMissingColumn(error);
    const hint = isMissingTable(error) ? SETUP_HINT : COLUMN_HINT;
    return NextResponse.json(
      { error: missing ? hint : error.message, setup_required: missing },
      { status: missing ? 503 : 500 },
    );
  }
  return NextResponse.json({ task: data });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const row = buildRow(body);
  if (!row.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("calendar_tasks")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const missing = isMissingColumn(error);
    return NextResponse.json(
      { error: missing ? COLUMN_HINT : error.message, setup_required: missing },
      { status: missing ? 503 : 500 },
    );
  }
  return NextResponse.json({ task: data });
}

/** Soft delete — the row and its completion history stay in the database. */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase
    .from("calendar_tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
