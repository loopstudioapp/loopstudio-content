import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isAdminRequest, sessionFromRequest } from "@/lib/owner-auth";

// TikTok/Lemon8 accounts (login emails, metrics). Admin session or OWNER_API_TOKEN
// gets everything; a member session only ever sees its own accounts (read-only).

const ACCOUNT_FIELDS = [
  "employee_id",
  "angle",
  "platform",
  "username",
  "login_email",
  "login_method",
  "app",
  "device",
  "status",
  "notes",
  "telegram_chat_id",
] as const;

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });
const failed = (scope: string, message: string) => {
  console.error(`[accounts ${scope}]`, message);
  return NextResponse.json({ error: "Database error" }, { status: 500 });
};
const noStore = { headers: { "Cache-Control": "no-store" } };

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function pickAccountFields(body: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const field of ACCOUNT_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    if (field === "angle") {
      const angle = typeof value === "number" ? value : parseInt(String(value), 10);
      if (!Number.isFinite(angle)) return null;
      row.angle = angle;
    } else if (value === null || typeof value === "string") {
      row[field] = value;
    } else {
      return null;
    }
  }
  return row;
}

async function latestTwo(accountId: string) {
  const { data, error } = await supabase
    .from("daily_metrics")
    .select("*")
    .eq("account_id", accountId)
    .order("date", { ascending: false })
    .limit(2);
  if (error) throw new Error(error.message);
  return { latest: data?.[0] ?? null, previous: data?.[1] ?? null };
}

export async function GET(req: Request) {
  const isAdmin = await isAdminRequest(req);
  const session = isAdmin ? null : await sessionFromRequest(req);
  const memberId = session?.role === "member" ? session.memberId : undefined;
  if (!isAdmin && !memberId) return forbidden();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const metricsMode = searchParams.get("metrics"); // "latest" | "all" | null

  try {
    if (id) {
      const { data: account, error } = await supabase.from("accounts").select("*").eq("id", id).maybeSingle();
      if (error) return failed("GET one", error.message);
      if (!account || (!isAdmin && account.employee_id !== memberId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (metricsMode !== "all") return NextResponse.json(account, noStore);
      const { data: metrics, error: metricsError } = await supabase
        .from("daily_metrics")
        .select("*")
        .eq("account_id", id)
        .order("date", { ascending: false });
      if (metricsError) return failed("GET metrics", metricsError.message);
      return NextResponse.json({ account, metrics: metrics ?? [] }, noStore);
    }

    const employeeId = isAdmin ? searchParams.get("employee_id") : memberId;
    let query = supabase.from("accounts").select("*").order("angle").order("username");
    if (employeeId) query = query.eq("employee_id", employeeId);
    const { data: accounts, error } = await query;
    if (error) return failed("GET", error.message);
    if (metricsMode !== "latest") return NextResponse.json(accounts ?? [], noStore);

    const pairs = await Promise.all((accounts ?? []).map(async (acc) => [acc.id, await latestTwo(acc.id)] as const));
    return NextResponse.json({ accounts: accounts ?? [], metrics: Object.fromEntries(pairs) }, noStore);
  } catch (error) {
    return failed("GET", error instanceof Error ? error.message : String(error));
  }
}

export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return forbidden();
  const body = await readBody(req);
  const row = body && pickAccountFields(body);
  if (!row || typeof row.employee_id !== "string" || !row.employee_id || typeof row.username !== "string" || !row.username) {
    return bad("employee_id and username are required");
  }
  const { data, error } = await supabase.from("accounts").insert(row).select().single();
  if (error) return failed("POST", error.message);
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  if (!(await isAdminRequest(req))) return forbidden();
  const body = await readBody(req);
  if (!body || typeof body.id !== "string" || !body.id) return bad("id is required");
  const updates = pickAccountFields(body);
  if (!updates || Object.keys(updates).length === 0) return bad("Invalid fields");
  const { data, error } = await supabase.from("accounts").update(updates).eq("id", body.id).select().maybeSingle();
  if (error) return failed("PUT", error.message);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

// Deletes the account with its generated content and metrics (same order as the old client code).
export async function DELETE(req: Request) {
  if (!(await isAdminRequest(req))) return forbidden();
  const body = await readBody(req);
  if (!body || typeof body.id !== "string" || !body.id) return bad("id is required");
  for (const table of ["content_generations", "daily_metrics"] as const) {
    const { error } = await supabase.from(table).delete().eq("account_id", body.id);
    if (error) return failed(`DELETE ${table}`, error.message);
  }
  const { error } = await supabase.from("accounts").delete().eq("id", body.id);
  if (error) return failed("DELETE", error.message);
  return NextResponse.json({ ok: true });
}
