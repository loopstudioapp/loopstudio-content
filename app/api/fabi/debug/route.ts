import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Debug-only: runs login against FABi and returns the parsed structure
 * (with the JWT redacted). Lets us see the real response shape so we
 * can pick the right brand_uid / company_uid / list_store_uid.
 *
 * Remove this route once we've confirmed the integration works.
 */
export async function GET() {
  const email = process.env.FABI_EMAIL;
  const password = process.env.FABI_PASSWORD;
  const STATIC_KEY = process.env.FABI_STATIC_ACCESS_TOKEN || "5c885b2ef8c34fb7b1d1fad11eef7bec";
  if (!email || !password) {
    return NextResponse.json({ error: "FABI_EMAIL/PASSWORD not set" }, { status: 500 });
  }

  const res = await fetch("https://posapi.ipos.vn/api/accounts/v1/user/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: STATIC_KEY,
      fabi_type: "pos-cms",
    },
    body: JSON.stringify({ email, password }),
  });

  const json = await res.json();

  // Redact token before returning
  function redact(obj: unknown): unknown {
    if (typeof obj !== "object" || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(redact);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === "token" && typeof v === "string") {
        out[k] = `<JWT length=${v.length}>`;
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }

  return NextResponse.json({
    status: res.status,
    response: redact(json),
  });
}
