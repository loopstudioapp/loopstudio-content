import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/owner-auth";

// Staff list incl. PINs: admin session or OWNER_API_TOKEN only.

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });
const failed = (scope: string, message: string) => {
  console.error(`[employees ${scope}]`, message);
  return NextResponse.json({ error: "Database error" }, { status: 500 });
};

const isPin = (value: unknown): value is string => typeof value === "string" && /^\d{4}$/.test(value);
const isName = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 100;
const isColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return forbidden();
  const { data, error } = await supabase.from("employees").select("*").order("name");
  if (error) return failed("GET", error.message);
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return forbidden();
  const body = await readBody(req);
  if (!body || !isName(body.name) || !isPin(body.pin)) return bad("Name and a 4-digit PIN are required");
  const row: Record<string, string> = { name: body.name, pin: body.pin };
  if (isColor(body.avatar_color)) row.avatar_color = body.avatar_color;
  const { data, error } = await supabase.from("employees").insert(row).select().single();
  if (error) return failed("POST", error.message);
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  if (!(await isAdminRequest(req))) return forbidden();
  const body = await readBody(req);
  if (!body || typeof body.id !== "string" || !body.id) return bad("id is required");
  if (!isName(body.name) || !isPin(body.pin)) return bad("Name and a 4-digit PIN are required");
  const { data, error } = await supabase
    .from("employees")
    .update({ name: body.name, pin: body.pin })
    .eq("id", body.id)
    .select()
    .maybeSingle();
  if (error) return failed("PUT", error.message);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  if (!(await isAdminRequest(req))) return forbidden();
  const body = await readBody(req);
  if (!body || typeof body.id !== "string" || !body.id) return bad("id is required");
  const { error } = await supabase.from("employees").delete().eq("id", body.id);
  if (error) return failed("DELETE", error.message);
  return NextResponse.json({ ok: true });
}
