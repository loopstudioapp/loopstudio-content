import { NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE, OWNER_SESSION_SECONDS } from "@/lib/owner-auth";

// Readable "hint" cookies used only by client pages for UI decisions. They grant
// nothing: the proxy and API routes trust only the signed httpOnly session cookie.
const HINT_COOKIES = ["owner_role", "admin", "employee_id", "employee_name"] as const;

export function setHint(response: NextResponse, name: (typeof HINT_COOKIES)[number], value: string) {
  response.cookies.set(name, value, { path: "/", maxAge: OWNER_SESSION_SECONDS, sameSite: "lax" });
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(OWNER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OWNER_SESSION_SECONDS,
  });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(OWNER_SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  for (const name of HINT_COOKIES) response.cookies.set(name, "", { path: "/", maxAge: 0 });
}
