import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// The login page (app/page.tsx) lists profiles and checks the PIN in the
// browser. It used to read `employees` straight from Supabase with the public
// anon key; this returns the same rows (select *, ordered by name).
export async function GET() {
  const { data, error } = await db.from("employees").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
