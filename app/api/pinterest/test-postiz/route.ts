import { NextResponse } from "next/server";
import { createPostizClient } from "@/lib/pinterest/postiz";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get("api_key");

  if (!apiKey) {
    return NextResponse.json({ error: "Missing api_key" }, { status: 400 });
  }

  try {
    const client = createPostizClient(apiKey);
    const integrations = await client.getIntegrations();
    return NextResponse.json({ ok: true, integrations });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Connection failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
