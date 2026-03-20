import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runPipelineForAccount, runFullPipeline } from "@/lib/pinterest/pipeline";
import type { PinterestAccount } from "@/lib/pinterest/types";

export const maxDuration = 300; // 5 minutes for Vercel Pro

export async function POST(req: Request) {
  const body = await req.json();
  const { account_id } = body;

  // If account_id provided, run for that account only
  if (account_id) {
    const { data: account, error } = await supabase
      .from("pinterest_accounts")
      .select("*")
      .eq("id", account_id)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const result = await runPipelineForAccount(account as PinterestAccount);
    return NextResponse.json(result);
  }

  // Otherwise run for all accounts
  const summary = await runFullPipeline();
  return NextResponse.json({ summary });
}
