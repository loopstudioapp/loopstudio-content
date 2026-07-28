import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  cleanAliases,
  FoodDetection,
  FoodMemory,
  normalizeFoodKey,
} from "@/lib/food";
import { findAndTouchFoodMemory } from "@/lib/food-memory-store";
import { getOpenRouterFoodApiKey } from "@/lib/openrouter-food";

export const runtime = "nodejs";

const MODEL = "xiaomi/mimo-v2.5";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
};

function getMessageText(response: OpenRouterResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
  }
  return "";
}

function parseDetection(raw: string): FoodDetection {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<FoodDetection>;
  const foodName =
    typeof parsed.food_name === "string" ? parsed.food_name.trim().slice(0, 100) : "";
  const normalizedName = normalizeFoodKey(
    typeof parsed.normalized_name === "string" ? parsed.normalized_name : foodName,
  );
  const confidence =
    typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0;

  return {
    food_found: Boolean(parsed.food_found && foodName && normalizedName),
    food_name: foodName,
    normalized_name: normalizedName,
    aliases: cleanAliases(parsed.aliases).filter((alias) => alias !== normalizedName),
    description:
      typeof parsed.description === "string"
        ? parsed.description.trim().replace(/\s+/g, " ").slice(0, 240)
        : "",
    confidence,
  };
}

async function detectFood(text: string, image: File | null): Promise<FoodDetection> {
  const apiKey = await getOpenRouterFoodApiKey();

  const instruction = `Identify the single primary food, drink, dish, or meal the user is asking about.
Return a stable, generic English canonical name so the same food matches later. For example, "an apple",
"red apples", and a photo of an apple should all normalize to "apple". For a composed dish, use the common
dish name rather than listing every ingredient. Do not decide whether it is healthy or whether the user
should eat it. If there is no identifiable edible item, set food_found to false. Keep the description to
one short, factual sentence about what was detected.`;

  let userContent: string | Array<Record<string, unknown>> = text || "Identify the food in this photo.";
  if (image) {
    const buffer = Buffer.from(await image.arrayBuffer());
    const dataUrl = `data:${image.type};base64,${buffer.toString("base64")}`;
    userContent = [
      { type: "text", text: text || "Identify the primary food in this photo." },
      { type: "image_url", image_url: { url: dataUrl } },
    ];
  }

  const body = {
    model: MODEL,
    temperature: 0.1,
    // Vision requests can spend a substantial part of the completion budget on
    // hidden reasoning before emitting the short structured answer.
    max_tokens: 2000,
    reasoning: { effort: "low", exclude: true },
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "food_detection",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            food_found: { type: "boolean" },
            food_name: { type: "string" },
            normalized_name: { type: "string" },
            aliases: { type: "array", items: { type: "string" }, maxItems: 10 },
            description: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: [
            "food_found",
            "food_name",
            "normalized_name",
            "aliases",
            "description",
            "confidence",
          ],
        },
      },
    },
  };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://content.loopstudio.tech/food",
      "X-Title": "Loop Food Memory",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });

  const payload = (await response.json()) as OpenRouterResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Food detection failed");
  }

  const raw = getMessageText(payload);
  if (!raw) throw new Error("The model returned an empty result");
  return parseDetection(raw);
}

async function findMemory(detection: FoodDetection): Promise<FoodMemory | null> {
  const keys = new Set([detection.normalized_name, ...detection.aliases]);
  return findAndTouchFoodMemory(keys);
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (cookieStore.get("admin")?.value !== "1") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const textValue = form.get("text");
    const imageValue = form.get("image");
    const text = typeof textValue === "string" ? textValue.trim().slice(0, 600) : "";
    const image = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;

    if (!text && !image) {
      return NextResponse.json(
        { error: "Describe a food or add a photo." },
        { status: 400 },
      );
    }

    if (image && (!ALLOWED_IMAGE_TYPES.has(image.type) || image.size > MAX_IMAGE_BYTES)) {
      return NextResponse.json(
        { error: "Use a JPG, PNG, WebP, or GIF image under 4 MB." },
        { status: 400 },
      );
    }

    const detection = await detectFood(text, image);
    if (!detection.food_found) {
      return NextResponse.json({ status: "no_food", detection });
    }

    const memory = await findMemory(detection);
    if (memory) {
      return NextResponse.json({ status: "known", detection, memory });
    }

    return NextResponse.json({ status: "unknown", detection });
  } catch (error) {
    console.error("Food analysis failed:", error);
    const message =
      error instanceof Error && error.message.includes("OPENROUTER_API_KEY")
        ? "Food detection is not configured yet."
        : "I couldn't check that food. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
