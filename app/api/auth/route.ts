import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const { employee_id, pin } = await req.json();
  const { data } = await db
    .from("employees")
    .select("id, name, pin")
    .eq("id", employee_id)
    .single();

  if (!data || data.pin !== pin) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  return NextResponse.json({ id: data.id, name: data.name });
}
