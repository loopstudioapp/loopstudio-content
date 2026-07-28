import { supabase } from "@/lib/supabase";

const BUCKET = "food-secrets";
const KEY_FILE = "openrouter.json";
let keyPromise: Promise<string> | null = null;

type StoredKey = {
  key: string;
  hash: string;
  created_at: string;
};

async function ensureSecretsBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) return;

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 16 * 1024,
    allowedMimeTypes: ["application/json"],
  });

  if (error && !error.message.toLowerCase().includes("already exists")) {
    throw error;
  }
}

async function loadStoredKey() {
  await ensureSecretsBucket();
  const { data, error } = await supabase.storage.from(BUCKET).download(KEY_FILE);
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("not found") || message.includes("does not exist")) return null;
    throw error;
  }

  const stored = JSON.parse(await data.text()) as Partial<StoredKey>;
  return typeof stored.key === "string" && stored.key.startsWith("sk-or-")
    ? stored.key
    : null;
}

async function provisionKey() {
  const managementKey = process.env.OPENROUTER_MANAGEMENT_API_KEY;
  if (!managementKey || managementKey.startsWith("[SENSITIVE")) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const response = await fetch("https://openrouter.ai/api/v1/keys", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Loop Food Memory Production",
      limit: 10,
      limit_reset: "monthly",
      include_byok_in_limit: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const payload = (await response.json()) as {
    key?: string;
    data?: { hash?: string };
    error?: { message?: string };
  };
  if (!response.ok || !payload.key || !payload.data?.hash) {
    throw new Error(payload.error?.message || "OpenRouter key provisioning failed");
  }

  const stored: StoredKey = {
    key: payload.key,
    hash: payload.data.hash,
    created_at: new Date().toISOString(),
  };
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(KEY_FILE, new Blob([JSON.stringify(stored)], { type: "application/json" }), {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });
  if (error) throw error;
  return payload.key;
}

export async function getOpenRouterFoodApiKey() {
  const configured = process.env.OPENROUTER_API_KEY;
  if (configured) return configured;

  if (!keyPromise) {
    keyPromise = (async () => (await loadStoredKey()) || provisionKey())().catch(
      (error) => {
        keyPromise = null;
        throw error;
      },
    );
  }
  return keyPromise;
}
