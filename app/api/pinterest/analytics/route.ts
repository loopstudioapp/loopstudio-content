import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const integrationId = searchParams.get("integration_id");

  if (!integrationId) {
    return NextResponse.json({ error: "Missing integration_id" }, { status: 400 });
  }

  // PostBridge does not provide analytics — return empty array
  return NextResponse.json([]);
}
