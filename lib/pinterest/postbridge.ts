import type { SchedulePinParams } from "./types";

const POSTBRIDGE_BASE = "https://api.post-bridge.com/v1";

interface PostBridgeAccount {
  id: number;
  platform: string;
  username: string;
}

interface UploadResult {
  id: string;
  path: string;
}

function headers(apiKey: string, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  };
}

/**
 * Fetch connected Pinterest accounts from PostBridge.
 */
export async function getIntegrations(
  apiKey: string
): Promise<PostBridgeAccount[]> {
  const res = await fetch(`${POSTBRIDGE_BASE}/social-accounts?platform=pinterest`, {
    method: "GET",
    headers: headers(apiKey),
  });

  if (!res.ok) {
    throw new Error(
      `PostBridge getIntegrations failed (${res.status}): ${await res.text()}`
    );
  }

  const json = await res.json();
  return json.data || json;
}

/**
 * Upload an image buffer to PostBridge (2-step: get upload URL, then PUT binary).
 */
export async function uploadImage(
  apiKey: string,
  imageBuffer: Buffer,
  filename: string
): Promise<UploadResult> {
  // Step 1: Get upload URL
  const createRes = await fetch(`${POSTBRIDGE_BASE}/media/create-upload-url`, {
    method: "POST",
    headers: headers(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: filename,
      mime_type: "image/png",
      size_bytes: imageBuffer.length,
    }),
  });

  if (!createRes.ok) {
    throw new Error(
      `PostBridge create-upload-url failed (${createRes.status}): ${await createRes.text()}`
    );
  }

  const { media_id, upload_url } = await createRes.json();

  // Step 2: PUT binary image data to the upload URL
  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array(imageBuffer),
  });

  if (!uploadRes.ok) {
    throw new Error(
      `PostBridge image upload failed (${uploadRes.status}): ${await uploadRes.text()}`
    );
  }

  return { id: media_id, path: media_id };
}

/**
 * Schedule a pin via PostBridge. Returns the created post ID.
 */
export async function schedulePin(
  apiKey: string,
  params: SchedulePinParams
): Promise<string> {
  const body = {
    caption: params.description,
    media: [params.imageId || params.imageUrl],
    social_accounts: [Number(params.integrationId)],
    scheduled_at: params.scheduledAt || null,
    platform_configurations: {
      pinterest: {
        title: params.title,
        link: params.appStoreUrl,
        board_ids: params.boardId ? [params.boardId] : [],
      },
    },
  };

  const res = await fetch(`${POSTBRIDGE_BASE}/posts`, {
    method: "POST",
    headers: headers(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `PostBridge schedulePin failed (${res.status}): ${await res.text()}`
    );
  }

  const data = await res.json();
  return data.id;
}

/**
 * Upload an image buffer and schedule it as a pin in one call.
 * Returns the PostBridge post ID.
 */
export async function uploadAndSchedulePin(
  apiKey: string,
  imageBuffer: Buffer,
  filename: string,
  params: SchedulePinParams
): Promise<string> {
  const media = await uploadImage(apiKey, imageBuffer, filename);

  return schedulePin(apiKey, {
    ...params,
    imageUrl: media.path,
    imageId: media.id,
  });
}

/** Convenience wrapper that binds an API key to all methods. */
export function createPostBridgeClient(apiKey: string) {
  return {
    getIntegrations: () => getIntegrations(apiKey),
    uploadImage: (buf: Buffer, name: string) => uploadImage(apiKey, buf, name),
    schedulePin: (p: SchedulePinParams) => schedulePin(apiKey, p),
  };
}
