import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Public: the login screen's profile picker. Only display fields, never the PIN.
export async function GET() {
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, avatar_color, created_at")
    .order("name");
  if (error) {
    console.error("[auth/profiles]", error.message);
    return NextResponse.json({ error: "Could not load profiles" }, { status: 500 });
  }
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "no-store" } });
}
