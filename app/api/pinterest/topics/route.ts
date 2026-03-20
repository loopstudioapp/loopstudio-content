import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ALL_TOPICS } from "@/lib/pinterest/topics";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  let query = supabase
    .from("pinterest_topics")
    .select("*")
    .order("times_used", { ascending: true });

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** Seed topics from hardcoded data */
export async function POST() {
  const toInsert = ALL_TOPICS.map((t) => ({
    id: t.id,
    category: t.category,
    title_template: t.titleTemplate,
    description_template: t.descriptionTemplate,
    prompt_seed: t.promptSeed,
  }));

  // Upsert to avoid duplicates
  const { data, error } = await supabase
    .from("pinterest_topics")
    .upsert(toInsert, { onConflict: "id" })
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ seeded: data?.length ?? 0 });
}
