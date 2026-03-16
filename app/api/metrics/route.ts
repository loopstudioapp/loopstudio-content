import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id");
  const latest = searchParams.get("latest");

  let query = supabase.from("daily_metrics").select("*").order("date", { ascending: false });

  if (accountId) query = query.eq("account_id", accountId);
  if (latest) query = query.limit(2);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  // Upsert: if metrics for this account+date already exist, update them
  const { data, error } = await supabase
    .from("daily_metrics")
    .upsert(body, { onConflict: "account_id,date" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
