// ---------------------------------------------------------------------------
// Operator sessions: a signed cookie holding { u: name, exp }. Web Crypto
// only (see ./tokens), so the same code verifies sessions in Edge middleware,
// Node route handlers and the voice gateway. Passwords live in ./passwords.
// ---------------------------------------------------------------------------

import { signToken, verifyToken } from "./tokens";

export const SESSION_COOKIE = "taap_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // one conference day

export interface OperatorSession {
  user: string;
  expiresAt: number; // epoch seconds
}

/** Auth is on when operators and a signing secret are configured. */
export function authEnabled(): boolean {
  return Boolean(process.env.OPERATOR_USERS && process.env.SESSION_SECRET);
}

export function signSession(user: string, secret: string, now = Date.now()): Promise<string> {
  return signToken({ u: user }, secret, SESSION_TTL_SECONDS, now);
}

export async function verifySession(
  token: string | undefined,
  secret: string,
  now = Date.now()
): Promise<OperatorSession | null> {
  const data = await verifyToken<{ u?: unknown }>(token, secret, now);
  if (!data || typeof data.u !== "string") return null;
  return { user: data.u, expiresAt: data.exp };
}

/** Reads the cookie from a request header (route handlers, gateway). */
export function readSessionCookie(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Operator behind a Cookie header: "demo" when auth is off, null when invalid. */
export async function operatorFromCookieHeader(
  cookieHeader: string | null | undefined
): Promise<string | null> {
  if (!authEnabled()) return "demo";
  const session = await verifySession(readSessionCookie(cookieHeader), process.env.SESSION_SECRET!);
  return session?.user ?? null;
}

/**
 * The signed-in operator for a request, or "demo" when auth is disabled
 * (local development). Returns null when auth is on and the session is bad.
 */
export function getOperator(req: Request): Promise<string | null> {
  return operatorFromCookieHeader(req.headers.get("cookie"));
}
