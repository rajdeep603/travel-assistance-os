import { z } from "zod";
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { cookieHeader, emailAllowed, logPortalEvent, openPortal, viewerCookieName, viewerToken } from "@/lib/partner-demo/portal";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  company: z.string().trim().min(2).max(120),
  email: z.string().trim().min(5).max(160),
  agree: z.literal(true),
});

/** The confidentiality acknowledgement: recorded with the viewer's name and e-mail, then a cookie opens the portal on this browser. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { token: string } }) => {
  const portal = await openPortal(params.token);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError("Please fill in your name, company and e-mail, and tick the box.", 400, "INCOMPLETE");
  const viewer = { name: parsed.data.name, company: parsed.data.company, email: parsed.data.email.toLowerCase() };
  if (!emailAllowed(portal, viewer.email)) {
    await logPortalEvent(portal.id, "ACKNOWLEDGE_REFUSED", viewer.email, { name: viewer.name, company: viewer.company });
    throw new ApiError("Please use your company e-mail address.", 403, "EMAIL_NOT_ALLOWED");
  }
  const { token, maxAge } = await viewerToken(portal, viewer);
  await logPortalEvent(portal.id, "ACKNOWLEDGED", viewer.email, {
    name: viewer.name,
    company: viewer.company,
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200),
  });
  const res = NextResponse.json({ viewer: { name: viewer.name, company: viewer.company } }, { status: 201 });
  res.headers.append("Set-Cookie", cookieHeader(req, viewerCookieName(portal.id), token, maxAge));
  return res;
});
