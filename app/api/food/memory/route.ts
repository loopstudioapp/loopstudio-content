import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  cleanAliases,
  cleanReasons,
  FoodDecision,
  FoodMemory,
  normalizeFoodKey,
  titleCaseFoodName,
} from "@/lib/food";
import {
  findAndTouchFoodMemory,
  getFoodMemories,
  upsertFoodMemory,
} from "@/lib/food-memory-store";

async function isAuthorized() {
  const cookieStore = await cookies();
  return cookieStore.get("admin")?.value === "1";
}

export async function GET(request: Request) {
  if (!(await isAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const name = new URL(request.url).searchParams.get("name");
    if (name) {
      const normalizedName = normalizeFoodKey(name);
      if (!normalizedName) {
        return NextResponse.json({ error: "Invalid food name." }, { status: 400 });
      }
      const memory = await findAndTouchFoodMemory(new Set([normalizedName]));
      return NextResponse.json({ memory });
    }

    const memories = await getFoodMemories(8);
    return NextResponse.json({ memories });
  } catch (error) {
    console.error("Food history failed:", error);
    return NextResponse.json({ error: "Couldn't load food memory." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const foodName =
      typeof body.food_name === "string"
        ? titleCaseFoodName(body.food_name)
        : "";
    const normalizedName = normalizeFoodKey(
      typeof body.normalized_name === "string" ? body.normalized_name : foodName,
    );
    const decision = body.decision as FoodDecision;
    const reasons = cleanReasons(body.reasons);
    const aliases = cleanAliases(body.aliases).filter(
      (alias) => alias !== normalizedName,
    );

    if (!foodName || !normalizedName || !["eat", "skip"].includes(decision)) {
      return NextResponse.json({ error: "Invalid food decision." }, { status: 400 });
    }

    if (!reasons.length) {
      return NextResponse.json(
        { error: "Add at least one reason so the decision is useful later." },
        { status: 400 },
      );
    }

    const memory = await upsertFoodMemory({
      food_name: foodName,
      normalized_name: normalizedName,
      aliases,
      decision,
      reasons,
      hit_count: 1,
    });
    return NextResponse.json({ memory: memory as FoodMemory });
  } catch (error) {
    console.error("Food memory save failed:", error);
    return NextResponse.json(
      { error: "I couldn't save that decision. Please try again." },
      { status: 500 },
    );
  }
}
