import type { SchedulePinParams } from "./types";

const POSTIZ_BASE = "https://api.postiz.com/public/v1";

interface PostizIntegration {
  id: string;
  name: string;
  provider: string;
  picture?: string;
}

interface UploadResult {
  id: string;
  path: string;
}

function headers(apiKey: string, extra?: Record<string, string>) {
  return {
    Authorization: apiKey,
    ...extra,
  };
}

/**
 * Fetch all connected integrations (channels) from Postiz.
 */
export async function getIntegrations(
  apiKey: string
): Promise<PostizIntegration[]> {
  const res = await fetch(`${POSTIZ_BASE}/integrations`, {
    method: "GET",
    headers: headers(apiKey),
  });

  if (!res.ok) {
    throw new Error(
      `Postiz getIntegrations failed (${res.status}): ${await res.text()}`
    );
  }

  return res.json();
}

/**
 * Upload an image buffer to Postiz and return the media reference.
 */
export async function uploadImage(
  apiKey: string,
  imageBuffer: Buffer,
  filename: string
): Promise<UploadResult> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/png" });
  formData.append("file", blob, filename);

  const res = await fetch(`${POSTIZ_BASE}/upload`, {
    method: "POST",
    headers: headers(apiKey),
    body: formData,
  });

  if (!res.ok) {
    throw new Error(
      `Postiz uploadImage failed (${res.status}): ${await res.text()}`
    );
  }

  const data = await res.json();
  return { id: data.id, path: data.path };
}

/**
 * Schedule a pin via Postiz. Returns the created post ID.
 */
export async function schedulePin(
  apiKey: string,
  params: SchedulePinParams
): Promise<string> {
  const body = {
    type: "schedule",
    date: params.scheduledAt,
    shortLink: false,
    tags: (params.tags || []).map((t) => ({ name: t })),
    posts: [
      {
        integration: { id: params.integrationId },
        value: [
          {
            content: params.description,
            image: [{ id: params.imageId || params.imageUrl, path: params.imageUrl }],
          },
        ],
        settings: {
          __type: "pinterest",
          board: params.boardId,
          title: params.title,
          link: params.appStoreUrl,
        },
      },
    ],
  };

  const res = await fetch(`${POSTIZ_BASE}/posts`, {
    method: "POST",
    headers: headers(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `Postiz schedulePin failed (${res.status}): ${await res.text()}`
    );
  }

  const data = await res.json();
  // Postiz returns an array: [{ postId, integration }]
  if (Array.isArray(data)) return data[0]?.postId || data[0]?.id;
  return data.postId || data.id;
}

/**
 * Upload an image buffer and schedule it as a pin in one call.
 * Returns the Postiz post ID.
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
  });
}

/** Convenience wrapper that binds an API key to all methods. */
export function createPostizClient(apiKey: string) {
  return {
    getIntegrations: () => getIntegrations(apiKey),
    uploadImage: (buf: Buffer, name: string) => uploadImage(apiKey, buf, name),
    schedulePin: (p: SchedulePinParams) => schedulePin(apiKey, p),
  };
}
