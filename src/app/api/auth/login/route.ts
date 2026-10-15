import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api";
import { ApiError, badRequest, unauthorized } from "@/lib/errors";
import { checkCredentials } from "@/lib/auth/passwords";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authEnabled,
  signSession,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

// Small in-process brake on password guessing (nginx rate-limits as well).
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000;

function throttle(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    throw new ApiError("Too many sign-in attempts. Please wait a few minutes.", 429, "RATE_LIMITED");
  }
}

export const POST = withErrorHandling(async (req: Request) => {
  if (!authEnabled()) throw badRequest("Sign-in is not configured on this server.");
  const { name, password } = Body.parse(await req.json().catch(() => ({})));

  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  throttle(`${ip}|${name.toLowerCase()}`);

  const user = await checkCredentials(name, password);
  if (!user) throw unauthorized("Incorrect name or password.");

  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, await signSession(user, process.env.SESSION_SECRET!), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
});
