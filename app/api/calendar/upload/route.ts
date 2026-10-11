import { NextRequest, NextResponse } from "next/server";
import { CALENDAR_IMAGE_PREFIX, CALENDAR_IMAGE_ROUTE, getImageBucket } from "@/lib/images";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Accepts a data URL and returns a public image URL.
 *
 * Images go to the R2 bucket (served by /api/calendar/image/<name>) so task
 * rows stay small. If the bucket cannot be reached the data URL is handed
 * straight back, which still renders — the attachment just travels inline
 * with the row instead.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const dataUrl = String(body.data_url || "");

  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) return NextResponse.json({ error: "Expected an image data URL" }, { status: 400 });

  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image is larger than 5 MB" }, { status: 413 });
  }

  const extension = contentType.split("/")[1].replace("jpeg", "jpg");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  try {
    await getImageBucket().put(`${CALENDAR_IMAGE_PREFIX}${path}`, buffer, { httpMetadata: { contentType } });
    const url = new URL(`${CALENDAR_IMAGE_ROUTE}${path}`, request.url).toString();
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ url: dataUrl, inline: true });
  }
}
