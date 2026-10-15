// ---------------------------------------------------------------------------
// Short-lived signed tokens (HMAC-SHA256, Web Crypto): payload.signature in
// base64url. Used for voice-gateway session tickets and Twilio media-stream
// parameters — anywhere one process vouches for a request to another.
// ---------------------------------------------------------------------------

import { ApiError } from "../errors";

const encoder = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Signs `payload` with an expiry `ttlSeconds` from now (field `exp`, epoch seconds). */
export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds: number,
  now = Date.now()
): Promise<string> {
  const body = b64url(
    encoder.encode(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSeconds }))
  );
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/** Returns the payload of a valid, unexpired token, else null. */
export async function verifyToken<T extends Record<string, unknown>>(
  token: string | null | undefined,
  secret: string,
  now = Date.now()
): Promise<(T & { exp: number }) | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromB64url(sig),
      encoder.encode(body)
    );
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(body))) as T & { exp?: unknown };
    if (typeof data.exp !== "number" || data.exp * 1000 <= now) return null;
    return data as T & { exp: number };
  } catch {
    return null;
  }
}

const DEV_GATEWAY_SECRET = "taap-dev-gateway-secret";

/**
 * Secret shared by the Next.js app and the voice gateway. Falls back to the
 * session secret, and to a fixed value only outside production.
 */
export function gatewaySecret(): string {
  const secret = process.env.GATEWAY_SECRET || process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new ApiError(
      "Voice is not configured on this server (GATEWAY_SECRET or SESSION_SECRET is missing).",
      503,
      "VOICE_NOT_CONFIGURED"
    );
  }
  return DEV_GATEWAY_SECRET;
}
