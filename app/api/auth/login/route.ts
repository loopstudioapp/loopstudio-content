import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createOwnerSession, safeEqual } from "@/lib/owner-auth";
import { clearAuthCookies, setHint, setSessionCookie } from "../cookies";

// Best-effort brute-force brake for 4-digit PINs (per server instance).
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest) {
  return request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function isLimited(key: string) {
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string) {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

function invalid() {
  return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const key = clientKey(request);
  if (isLimited(key)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let body: { role?: unknown; memberId?: unknown; pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!/^\d{4}$/.test(pin)) {
    recordFailure(key);
    return invalid();
  }

  try {
    if (body.role === "admin") {
      const adminPin = process.env.OWNER_ADMIN_PIN;
      if (!adminPin) return NextResponse.json({ error: "Login is not configured" }, { status: 500 });
      if (!(await safeEqual(pin, adminPin))) {
        recordFailure(key);
        return invalid();
      }
      const response = NextResponse.json({ role: "admin", redirect: "/owner" });
      clearAuthCookies(response);
      setSessionCookie(response, await createOwnerSession("admin"));
      setHint(response, "owner_role", "admin");
      setHint(response, "admin", "1");
      return response;
    }

    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    if (!memberId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { data } = await supabase
      .from("employees")
      .select("id, name, pin")
      .eq("id", memberId)
      .maybeSingle();
    const storedPin = data?.pin == null ? "" : String(data.pin);
    // Always run the comparison so a missing member and a wrong PIN look alike.
    const matches = await safeEqual(pin, storedPin || "\u0000no-member");
    if (!data || !storedPin || !matches) {
      recordFailure(key);
      return invalid();
    }

    const name = String(data.name ?? "");
    const isKien = name.trim().toLocaleLowerCase() === "kien";
    const response = NextResponse.json({
      role: isKien ? "kien" : "member",
      redirect: isKien ? "/owner" : "/dashboard",
    });
    clearAuthCookies(response);
    if (isKien) {
      setSessionCookie(response, await createOwnerSession("kien", String(data.id)));
      setHint(response, "owner_role", "kien");
    } else {
      setSessionCookie(response, await createOwnerSession("member", String(data.id)));
      setHint(response, "employee_id", String(data.id));
      setHint(response, "employee_name", name);
    }
    return response;
  } catch (error) {
    console.error("[auth/login]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not sign in" }, { status: 500 });
  }
}
