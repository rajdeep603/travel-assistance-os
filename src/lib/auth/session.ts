// ---------------------------------------------------------------------------
// Operator sessions: a signed cookie holding { u: name, s: signed-in at, exp }.
// Web Crypto only (see ./tokens), so the same code verifies sessions in Edge
// middleware, Node route handlers and the voice gateway. Passwords live in
// ./passwords.
//
// Sessions slide. The 12 h lifetime is an idle timeout: middleware re-issues
// the cookie while the operator keeps working, so a presenter who signs in at
// 07:30 isn't signed out at 19:30 mid-reception, while a laptop left alone
// overnight is. Renewal is one HMAC (no database) and happens at most hourly.
// Nothing renews past a week after sign-in; being whole days, that cap lands
// at the time of day the operator signed in, i.e. before the booth opens.
// ---------------------------------------------------------------------------

import { signToken, verifyToken } from "./tokens";

export const SESSION_COOKIE = "taap_session";
/** Idle timeout: a conference day without a single request. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
/** Re-issue once renewal would push the expiry out by at least this much. */
export const SESSION_RENEW_AFTER_SECONDS = 60 * 60;
/** Absolute cap, counted from sign-in. */
export const SESSION_MAX_SECONDS = 7 * 24 * 60 * 60;

export interface OperatorSession {
  user: string;
  expiresAt: number; // epoch seconds
  signedInAt: number; // epoch seconds
}

/** Auth is on when operators and a signing secret are configured. */
export function authEnabled(): boolean {
  return Boolean(process.env.OPERATOR_USERS && process.env.SESSION_SECRET);
}

/** A session token valid for the idle timeout, never past the cap from `signedInAt`. */
export function signSession(
  user: string,
  secret: string,
  now = Date.now(),
  signedInAt = Math.floor(now / 1000)
): Promise<string> {
  const ttl = Math.min(SESSION_TTL_SECONDS, signedInAt + SESSION_MAX_SECONDS - Math.floor(now / 1000));
  return signToken({ u: user, s: signedInAt }, secret, ttl, now);
}

export async function verifySession(
  token: string | undefined,
  secret: string,
  now = Date.now()
): Promise<OperatorSession | null> {
  const data = await verifyToken<{ u?: unknown; s?: unknown }>(token, secret, now);
  if (!data || typeof data.u !== "string") return null;
  return {
    user: data.u,
    expiresAt: data.exp,
    // Cookies from before sliding sessions: count from when they were issued.
    signedInAt: typeof data.s === "number" ? data.s : data.exp - SESSION_TTL_SECONDS,
  };
}

/**
 * A fresh cookie for a session in use, or null while the current one is less
 * than an hour old (or already ends at the cap).
 */
export async function renewSession(
  session: OperatorSession,
  secret: string,
  now = Date.now()
): Promise<{ token: string; maxAge: number } | null> {
  const nowSec = Math.floor(now / 1000);
  const expiresAt = Math.min(nowSec + SESSION_TTL_SECONDS, session.signedInAt + SESSION_MAX_SECONDS);
  if (expiresAt - session.expiresAt < SESSION_RENEW_AFTER_SECONDS) return null;
  return {
    token: await signSession(session.user, secret, now, session.signedInAt),
    maxAge: expiresAt - nowSec,
  };
}

/** Session cookie attributes, the same at sign-in and on renewal. */
export function sessionCookieOptions(req: Request, maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge,
  };
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
