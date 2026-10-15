import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, verifySession } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// Operator gate: every page and API needs a signed-in operator, except the
// endpoints that authenticate some other way (Twilio signatures, secret
// inbound webhook paths) and the health check. Disabled when OPERATOR_USERS /
// SESSION_SECRET are unset, so local development and CI stay frictionless.
// ---------------------------------------------------------------------------

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  "/api/health",
  "/api/twilio/",
  "/api/inbound/",
  // Claimants' signed upload links (the token is the credential).
  "/upload/",
  "/api/public/",
];

export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = await verifySession(
    req.cookies.get(SESSION_COOKIE)?.value,
    process.env.SESSION_SECRET!
  );
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Please sign in to continue." } },
      { status: 401 }
    );
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's static assets and the app icon.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
