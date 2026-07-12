import { NextRequest, NextResponse } from "next/server";
import {
  createGrailScanSession,
  GRAILSCAN_SESSION_COOKIE,
  GRAILSCAN_SESSION_SECONDS,
  passwordMatches,
} from "@/lib/grailscan-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { password?: string };
    if (!body.password || !passwordMatches(body.password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(GRAILSCAN_SESSION_COOKIE, createGrailScanSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: GRAILSCAN_SESSION_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Could not authenticate" }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(GRAILSCAN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
