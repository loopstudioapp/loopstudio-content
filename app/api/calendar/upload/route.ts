import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "calendar-images";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Accepts a data URL and returns a public image URL.
 *
 * Images go to Supabase Storage so task rows stay small. If the bucket cannot
 * be reached the data URL is handed straight back, which still renders — the
 * attachment just travels inline with the row instead.
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
    // Idempotent: an "already exists" error here is the expected steady state.
    await supabase.storage.createBucket(BUCKET, { public: true });

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("No public URL returned");

    return NextResponse.json({ url: data.publicUrl });
  } catch {
    return NextResponse.json({ url: dataUrl, inline: true });
  }
}
