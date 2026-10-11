import { NextRequest, NextResponse } from "next/server";
import { CALENDAR_IMAGE_NAME, CALENDAR_IMAGE_PREFIX, getImageBucket } from "@/lib/images";

export const dynamic = "force-dynamic";

// Public, like the Supabase Storage bucket it replaces: names are random.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!CALENDAR_IMAGE_NAME.test(name)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const object = await getImageBucket().get(`${CALENDAR_IMAGE_PREFIX}${name}`);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      etag: object.httpEtag,
      "x-content-type-options": "nosniff",
      // Same-origin now (Supabase served these from its own domain): an
      // uploaded SVG must not run script here.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
