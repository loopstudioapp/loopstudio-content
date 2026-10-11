// Calendar task images: R2 bucket `content-dashboard-images` (binding IMAGES),
// served by app/api/calendar/image/[name]/route.ts. Moved from the public
// Supabase Storage bucket `calendar-images` on 2026-10-11.
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type R2Object = {
  body: ReadableStream;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
};
export type R2Bucket = {
  get(key: string): Promise<R2Object | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
};

export const CALENDAR_IMAGE_PREFIX = "calendar/";
export const CALENDAR_IMAGE_ROUTE = "/api/calendar/image/";
// Same names the upload route generates: <ms>-<random>.<ext>
export const CALENDAR_IMAGE_NAME = /^[A-Za-z0-9._-]{1,200}$/;

export function getImageBucket(): R2Bucket {
  const env = getCloudflareContext().env as unknown as { IMAGES?: R2Bucket };
  if (!env.IMAGES) throw new Error("R2 binding IMAGES is not configured");
  return env.IMAGES;
}
