// Owner website auth: HMAC-SHA256 signed session cookie + bearer token checks.
// Web Crypto only, so it runs in the proxy (Edge or Node) and in route handlers.

export const OWNER_SESSION_COOKIE = "owner_session";
export const OWNER_SESSION_SECONDS = 60 * 60 * 24; // 24 h, same as the old PIN cookies

export type OwnerRole = "admin" | "kien" | "member";
export type OwnerSession = { role: OwnerRole; memberId?: string; exp: number };

const ROLES: readonly OwnerRole[] = ["admin", "kien", "member"];
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "===".slice((base64.length + 3) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    keyCache.set(secret, key);
  }
  return key;
}

function sessionSecret(): string | null {
  const secret = process.env.OWNER_SESSION_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

export async function createOwnerSession(role: OwnerRole, memberId?: string): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new Error("OWNER_SESSION_SECRET is not configured");
  const session: OwnerSession = {
    role,
    ...(memberId ? { memberId } : {}),
    exp: Math.floor(Date.now() / 1000) + OWNER_SESSION_SECONDS,
  };
  const payload = toBase64Url(encoder.encode(JSON.stringify(session)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the session only when the signature is valid and it has not expired. */
export async function verifyOwnerSession(token: string | undefined | null): Promise<OwnerSession | null> {
  const secret = sessionSecret();
  if (!secret || !token || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signatureText] = parts;
  const signature = fromBase64Url(signatureText);
  if (!signature || signature.length !== 32) return null;
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature as BufferSource,
    encoder.encode(payload),
  );
  if (!valid) return null;
  try {
    const bytes = fromBase64Url(payload);
    if (!bytes) return null;
    const session = JSON.parse(new TextDecoder().decode(bytes)) as Partial<OwnerSession>;
    if (!session.role || !ROLES.includes(session.role)) return null;
    if (typeof session.exp !== "number" || session.exp <= Math.floor(Date.now() / 1000)) return null;
    if (session.memberId !== undefined && typeof session.memberId !== "string") return null;
    return { role: session.role, memberId: session.memberId, exp: session.exp };
  } catch {
    return null;
  }
}

/** Constant-time string comparison (both sides hashed to equal length first). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** True when the Authorization header is exactly "Bearer <secret>" and the secret is set. */
export async function bearerMatches(authorization: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || !authorization || !authorization.startsWith("Bearer ")) return false;
  return safeEqual(authorization.slice("Bearer ".length), secret);
}

function cookieValue(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

export function sessionFromRequest(request: Request): Promise<OwnerSession | null> {
  return verifyOwnerSession(cookieValue(request.headers.get("cookie"), OWNER_SESSION_COOKIE));
}

/** Admin session cookie or the owner API token. */
export async function isAdminRequest(request: Request): Promise<boolean> {
  if (await bearerMatches(request.headers.get("authorization"), process.env.OWNER_API_TOKEN)) return true;
  return (await sessionFromRequest(request))?.role === "admin";
}
