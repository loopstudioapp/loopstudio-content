import { NextRequest, NextResponse } from "next/server";
import {
  bearerMatches,
  OWNER_SESSION_COOKIE,
  verifyOwnerSession,
} from "@/lib/owner-auth";

const ADMIN_ONLY_PREFIXES = [
  "/admin",
  "/calendar",
  "/food",
  "/grailscan",
  "/portfolio",
];

// API routes reachable without an owner session or token. Each one either is the
// login itself or verifies its own secret:
// - /api/cron/*: every handler requires "Bearer CRON_SECRET".
// - /api/webhooks/revenuecat: RevenueCat bearer secret checked in the handler.
const PUBLIC_API_EXACT = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/profiles", // login picker: names and colors only, never PINs
  "/api/webhooks/revenuecat",
]);
const PUBLIC_API_PREFIXES = ["/api/cron/"];

// Vercel Cron calls (vercel.json) carry "Authorization: Bearer CRON_SECRET".
// Those paths also accept that secret here; their handlers keep their own checks.
const CRON_API_PATHS = new Set([
  "/api/fabi/sync",
  "/api/revenuecat",
  "/api/openrouter-costs",
  "/api/game-studio",
]);

// A member (staff) session may only reach the APIs its pages use; each handler
// also scopes the data to that member. Everything else (revenue, costs, staff
// PINs, calendar, Pinterest...) needs an admin or Kien session or a token.
const MEMBER_API_PREFIXES = ["/api/accounts", "/api/generate-content"];

function isRoute(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

async function guardApi(request: NextRequest, pathname: string) {
  if (PUBLIC_API_EXACT.has(pathname) || PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  if (await bearerMatches(authorization, process.env.OWNER_API_TOKEN)) return NextResponse.next();
  if (CRON_API_PATHS.has(pathname) && (await bearerMatches(authorization, process.env.CRON_SECRET))) {
    return NextResponse.next();
  }
  const session = await verifyOwnerSession(request.cookies.get(OWNER_SESSION_COOKIE)?.value);
  if (session) {
    if (session.role !== "member" || MEMBER_API_PREFIXES.some((prefix) => isRoute(pathname, prefix))) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isRoute(pathname, "/api")) return guardApi(request, pathname);

  const session = await verifyOwnerSession(request.cookies.get(OWNER_SESSION_COOKIE)?.value);
  const isAdmin = session?.role === "admin";
  const isKien = session?.role === "kien";

  if (pathname === "/owner") {
    if (isAdmin || isKien) return NextResponse.next();
    return NextResponse.redirect(new URL("/", request.url));
  }

  const isOwnerSubpage = pathname.startsWith("/owner/");
  const isAdminOnlyPage = ADMIN_ONLY_PREFIXES.some((prefix) =>
    isRoute(pathname, prefix),
  );

  if (isOwnerSubpage || isAdminOnlyPage) {
    if (isAdmin) return NextResponse.next();
    return NextResponse.redirect(new URL(isKien ? "/owner" : "/", request.url));
  }

  // A Kien session is deliberately limited to the owner dashboard. Keep the
  // login page reachable so the browser can switch back to the admin profile.
  if (isKien && pathname !== "/") {
    return NextResponse.redirect(new URL("/owner", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\..*).*)",
  ],
};
