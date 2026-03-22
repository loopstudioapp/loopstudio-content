import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const CACHE_KEY = "__rc_dashboard_cache__";

// GET — read cached RevenueCat data from DB
export async function GET() {
  const { data } = await supabase
    .from("pinterest_topics")
    .select("description_template, prompt_seed")
    .eq("id", CACHE_KEY)
    .single();

  if (!data) {
    return NextResponse.json({ cached: false });
  }

  try {
    const parsed = JSON.parse(data.description_template || "{}");
    return NextResponse.json({ cached: true, ...parsed, updated_at: data.prompt_seed });
  } catch {
    return NextResponse.json({ cached: false });
  }
}

// POST — save RevenueCat data to DB
export async function POST(req: NextRequest) {
  const body = await req.json();

  await supabase.from("pinterest_topics").upsert(
    {
      id: CACHE_KEY,
      category: "system",
      title_template: "RC Dashboard Cache",
      description_template: JSON.stringify(body),
      prompt_seed: new Date().toISOString(),
      times_used: 0,
    },
    { onConflict: "id" }
  );

  return NextResponse.json({ ok: true });
}
