import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const GRAILSCAN_SESSION_COOKIE = "grailscan_dashboard_session";
export const GRAILSCAN_SESSION_SECONDS = 8 * 60 * 60;

function sessionSecret(): string {
  const value = process.env.GRAILSCAN_DASHBOARD_SESSION_SECRET;
  if (!value) throw new Error("Missing GRAILSCAN_DASHBOARD_SESSION_SECRET");
  return value;
}

function signature(expiresAt: string): string {
  return createHmac("sha256", sessionSecret())
    .update(`grailscan:${expiresAt}`)
    .digest("base64url");
}

export function createGrailScanSession(): string {
  const expiresAt = String(Math.floor(Date.now() / 1000) + GRAILSCAN_SESSION_SECONDS);
  return `${expiresAt}.${signature(expiresAt)}`;
}

export function hasValidGrailScanSession(request: NextRequest): boolean {
  const value = request.cookies.get(GRAILSCAN_SESSION_COOKIE)?.value;
  if (!value) return false;
  const [expiresAt, suppliedSignature] = value.split(".");
  if (!expiresAt || !suppliedSignature || Number(expiresAt) <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = Buffer.from(signature(expiresAt));
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function passwordMatches(value: string): boolean {
  const expectedPassword = process.env.GRAILSCAN_DASHBOARD_PASSWORD;
  if (!expectedPassword) throw new Error("Missing GRAILSCAN_DASHBOARD_PASSWORD");
  const expected = Buffer.from(expectedPassword);
  const supplied = Buffer.from(value);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
