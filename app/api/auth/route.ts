import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const { employee_id, pin } = await req.json();
  const { data } = await supabase
    .from("employees")
    .select("id, name, pin")
    .eq("id", employee_id)
    .single();

  if (!data || data.pin !== pin) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  return NextResponse.json({ id: data.id, name: data.name });
}
