import { NextRequest, NextResponse } from "next/server";

const ADMIN_ONLY_PREFIXES = [
  "/admin",
  "/calendar",
  "/food",
  "/grailscan",
  "/portfolio",
];

function isRoute(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get("owner_role")?.value;
  const isAdmin = role === "admin" || request.cookies.get("admin")?.value === "1";
  const isKien = role === "kien";

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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\..*).*)"],
};
