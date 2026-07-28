import { supabase } from "@/lib/supabase";
import { FoodMemory } from "@/lib/food";

const BUCKET = "food-memory";
const MEMORY_FILE = "memories.json";
let bucketReady: Promise<void> | null = null;

async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await supabase.storage.getBucket(BUCKET);
      if (data) return;

      const { error } = await supabase.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 1024 * 1024,
        allowedMimeTypes: ["application/json"],
      });

      if (error && !error.message.toLowerCase().includes("already exists")) {
        throw error;
      }
    })().catch((error) => {
      bucketReady = null;
      throw error;
    });
  }

  await bucketReady;
}

async function readMemories(): Promise<FoodMemory[]> {
  await ensureBucket();
  const { data, error } = await supabase.storage.from(BUCKET).download(MEMORY_FILE);
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("not found") || message.includes("does not exist")) return [];
    throw error;
  }

  const parsed = JSON.parse(await data.text()) as unknown;
  return Array.isArray(parsed) ? (parsed as FoodMemory[]) : [];
}

async function writeMemories(memories: FoodMemory[]) {
  await ensureBucket();
  const payload = JSON.stringify(memories);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(MEMORY_FILE, new Blob([payload], { type: "application/json" }), {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });
  if (error) throw error;
}

export async function getFoodMemories(limit?: number): Promise<FoodMemory[]> {
  const memories = await readMemories();
  const sorted = memories.sort(
    (a, b) =>
      new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime(),
  );
  return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
}

export async function findAndTouchFoodMemory(keys: Set<string>) {
  const memories = await readMemories();
  const index = memories.findIndex(
    (item) =>
      keys.has(item.normalized_name) ||
      item.aliases.some((alias) => keys.has(alias)),
  );
  if (index < 0) return null;

  const now = new Date().toISOString();
  memories[index] = {
    ...memories[index],
    hit_count: memories[index].hit_count + 1,
    last_used_at: now,
  };
  await writeMemories(memories);
  return memories[index];
}

export async function upsertFoodMemory(
  memory: Omit<FoodMemory, "id" | "created_at" | "updated_at" | "last_used_at">,
) {
  const memories = await readMemories();
  const now = new Date().toISOString();
  const index = memories.findIndex(
    (item) => item.normalized_name === memory.normalized_name,
  );

  const saved: FoodMemory = {
    ...memory,
    id: index >= 0 ? memories[index].id : crypto.randomUUID(),
    created_at: index >= 0 ? memories[index].created_at : now,
    updated_at: now,
    last_used_at: now,
  };

  if (index >= 0) memories[index] = saved;
  else memories.push(saved);
  await writeMemories(memories);
  return saved;
}
