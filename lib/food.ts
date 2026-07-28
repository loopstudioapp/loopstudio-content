export type FoodDecision = "eat" | "skip";

export type FoodMemory = {
  id: string;
  food_name: string;
  normalized_name: string;
  aliases: string[];
  decision: FoodDecision;
  reasons: string[];
  hit_count: number;
  last_used_at: string;
  created_at: string;
  updated_at: string;
};

export type FoodDetection = {
  food_found: boolean;
  food_name: string;
  normalized_name: string;
  aliases: string[];
  description: string;
  confidence: number;
};

export function normalizeFoodKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

export function cleanReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((reason): reason is string => typeof reason === "string")
    .map((reason) => reason.trim().replace(/\s+/g, " ").slice(0, 240))
    .filter(Boolean)
    .slice(0, 6);
}

export function cleanAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((alias): alias is string => typeof alias === "string")
        .map(normalizeFoodKey)
        .filter(Boolean),
    ),
  ).slice(0, 10);
}
