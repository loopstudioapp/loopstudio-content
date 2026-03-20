import { NextResponse } from "next/server";
import { runFullPipeline } from "@/lib/pinterest/pipeline";

export const maxDuration = 300;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runFullPipeline();
  return NextResponse.json({ ok: true, summary });
}
