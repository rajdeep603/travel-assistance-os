import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { hashPassword } from "@/lib/auth/passwords";
import {
  SESSION_COOKIE,
  SESSION_MAX_SECONDS,
  SESSION_TTL_SECONDS,
  renewSession,
  signSession,
  verifySession,
} from "@/lib/auth/session";
import { signToken } from "@/lib/auth/tokens";
import { middleware } from "@/middleware";

// Sliding operator sessions: 12 idle hours, renewed while the operator works,
// never beyond a week after sign-in.

const SECRET = "s3cret";
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 14, 4, 30); // 07:30 in Istanbul

/** An operator who makes a request every `every` ms; returns the token held at `until`. */
async function workUntil(until: number, every: number, token: string): Promise<string> {
  for (let t = T0 + every; t <= until; t += every) {
    const session = await verifySession(token, SECRET, t);
    if (!session) throw new Error(`signed out at +${(t - T0) / HOUR} h`);
    token = (await renewSession(session, SECRET, t))?.token ?? token;
  }
  return token;
}

describe("sliding operator sessions", () => {
  it("keeps an operator who keeps working signed in past twelve hours", async () => {
    // 07:30 sign-in, busy until 23:30: the old fixed cookie died at 19:30.
    const token = await workUntil(T0 + 16 * HOUR, 20 * MIN, await signSession("elif", SECRET, T0));
    expect(await verifySession(token, SECRET, T0 + 16 * HOUR + MIN)).toMatchObject({ user: "elif" });
  });

  it("still signs out after twelve idle hours", async () => {
    const token = await workUntil(T0 + 3 * HOUR, HOUR, await signSession("elif", SECRET, T0));
    expect(await verifySession(token, SECRET, T0 + 15 * HOUR - MIN)).not.toBeNull();
    expect(await verifySession(token, SECRET, T0 + 15 * HOUR)).toBeNull();
  });

  it("re-issues at most hourly", async () => {
    const session = (await verifySession(await signSession("elif", SECRET, T0), SECRET, T0))!;
    expect(await renewSession(session, SECRET, T0 + 59 * MIN)).toBeNull();
    const renewed = await renewSession(session, SECRET, T0 + HOUR);
    expect(renewed?.maxAge).toBe(SESSION_TTL_SECONDS);
    expect((await verifySession(renewed!.token, SECRET, T0 + HOUR))?.expiresAt).toBe((T0 + HOUR) / 1000 + SESSION_TTL_SECONDS);
  });

  it("never extends a session beyond a week after sign-in", async () => {
    const token = await workUntil(T0 + 7 * DAY - HOUR, HOUR, await signSession("elif", SECRET, T0));
    const session = await verifySession(token, SECRET, T0 + 7 * DAY - MIN);
    expect(session).toMatchObject({ signedInAt: T0 / 1000, expiresAt: T0 / 1000 + SESSION_MAX_SECONDS });
    expect(await renewSession(session!, SECRET, T0 + 7 * DAY - MIN)).toBeNull();
    expect(await verifySession(token, SECRET, T0 + 7 * DAY)).toBeNull();
  });

  it("renews cookies issued before sessions could slide", async () => {
    const legacy = await signToken({ u: "elif" }, SECRET, SESSION_TTL_SECONDS, T0);
    const session = await verifySession(legacy, SECRET, T0 + 2 * HOUR);
    expect(session).toMatchObject({ user: "elif", signedInAt: T0 / 1000 });
    expect(await renewSession(session!, SECRET, T0 + 2 * HOUR)).not.toBeNull();
  });
});

describe("middleware session renewal", () => {
  const saved = { users: process.env.OPERATOR_USERS, secret: process.env.SESSION_SECRET };
  beforeEach(async () => {
    process.env.OPERATOR_USERS = `elif:${await hashPassword("horse-battery")}`;
    process.env.SESSION_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.OPERATOR_USERS = saved.users;
    process.env.SESSION_SECRET = saved.secret;
  });

  const request = (path: string, token: string, headers: Record<string, string> = {}) =>
    new NextRequest(`http://app:3000${path}`, { headers: { cookie: `${SESSION_COOKIE}=${token}`, ...headers } });

  it("re-issues an hour-old cookie with exactly the sign-in cookie's attributes", async () => {
    const { POST: login } = await import("@/app/api/auth/login/route");
    const signIn = await login(
      new Request("http://app:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
        body: JSON.stringify({ name: "elif", password: "horse-battery" }),
      }),
      {}
    );
    expect(signIn.status).toBe(200);
    // Everything but the value and the clock-derived Expires.
    const attributes = (setCookie: string | null) =>
      setCookie?.replace(/^taap_session=[^;]*;\s*/, "").replace(/Expires=[^;]*;\s*/, "");
    const signInAttributes = attributes(signIn.headers.get("set-cookie"));
    expect(signInAttributes).toMatch(/Max-Age=43200/);

    const token = await signSession("elif", SECRET, Date.now() - 2 * HOUR);
    const res = await middleware(request("/cases", token, { "x-forwarded-proto": "https" }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(attributes(res.headers.get("set-cookie"))).toBe(signInAttributes);
    const renewed = await verifySession(res.cookies.get(SESSION_COOKIE)?.value, SECRET);
    expect(renewed).toMatchObject({ user: "elif" });
    expect(renewed!.expiresAt).toBeGreaterThan(Date.now() / 1000 + SESSION_TTL_SECONDS - 60);
  });

  it("leaves a fresh cookie alone", async () => {
    const res = await middleware(request("/api/cases", await signSession("elif", SECRET)));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("still turns away an expired session", async () => {
    const stale = await signSession("elif", SECRET, Date.now() - 13 * HOUR);
    expect((await middleware(request("/api/cases", stale))).status).toBe(401);
    const page = await middleware(request("/cases", stale));
    expect(page.headers.get("location")).toContain("/login?next=%2Fcases");
  });
});
