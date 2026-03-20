import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id");
  const status = searchParams.get("status");
  const date = searchParams.get("date");

  let query = supabase
    .from("pinterest_pins")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (accountId) query = query.eq("account_id", accountId);
  if (status) query = query.eq("status", status);
  if (date) query = query.gte("created_at", `${date}T00:00:00`).lte("created_at", `${date}T23:59:59`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
