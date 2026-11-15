import { z } from "zod";
import { json, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { PORTAL_KITS } from "@/lib/partner-demo/kit";
import { newPortalToken, portalState, portalUsage } from "@/lib/partner-demo/portal";
import { kitRecords } from "@/lib/partner-demo/views";

export const dynamic = "force-dynamic";

/** Every partner demo portal with its state, voice time used and last activity. */
export const GET = withErrorHandling(async () => {
  const portals = await prisma.demoPortal.findMany({
    orderBy: { createdAt: "desc" },
    include: { events: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { events: true } } },
  });
  return json({
    kits: Object.values(PORTAL_KITS).map((k) => ({ id: k.id, company: k.company })),
    portals: await Promise.all(
      portals.map(async (p) => ({
        id: p.id,
        token: p.token,
        kit: p.kit,
        company: p.company,
        contactName: p.contactName,
        contactEmail: p.contactEmail,
        emailDomain: p.emailDomain,
        hostContact: p.hostContact,
        expiresAt: p.expiresAt.toISOString(),
        revokedAt: p.revokedAt?.toISOString() ?? null,
        state: portalState(p),
        minuteBudget: p.minuteBudget,
        sessionSeconds: p.sessionSeconds,
        maxConcurrent: p.maxConcurrent,
        createdBy: p.createdBy,
        createdAt: p.createdAt.toISOString(),
        usage: await portalUsage(p),
        events: p._count.events,
        lastEvent: p.events[0] ? { type: p.events[0].type, viewer: p.events[0].viewer, at: p.events[0].createdAt.toISOString() } : null,
      }))
    ),
  });
});

const Body = z.object({
  kit: z.string().min(1).max(30),
  company: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(80),
  contactEmail: z.string().trim().email().max(160),
  emailDomain: z.string().trim().max(80).optional(),
  hostContact: z.string().trim().max(200).optional(),
  expiresAt: z.string().min(10).max(40),
  minuteBudget: z.number().int().min(5).max(600).default(60),
  sessionSeconds: z.number().int().min(60).max(900).default(300),
  maxConcurrent: z.number().int().min(1).max(5).default(2),
});

/** Creates a portal (and the kit's demo records if this database lacks them). */
export const POST = withErrorHandling(async (req: Request) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  if (!PORTAL_KITS[body.kit]) throw badRequest("Unknown demo kit.");
  const expiresAt = new Date(body.expiresAt.length === 10 ? `${body.expiresAt}T20:59:59Z` : body.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw badRequest("Choose an expiry date in the future.");
  await kitRecords(body.kit);
  const domain = body.emailDomain?.replace(/^@/, "").toLowerCase() || body.contactEmail.split("@")[1]?.toLowerCase() || null;
  const portal = await prisma.demoPortal.create({
    data: {
      token: newPortalToken(),
      kit: body.kit,
      company: body.company,
      contactName: body.contactName,
      contactEmail: body.contactEmail.toLowerCase(),
      emailDomain: domain,
      hostContact: body.hostContact || null,
      expiresAt,
      minuteBudget: body.minuteBudget,
      sessionSeconds: body.sessionSeconds,
      maxConcurrent: body.maxConcurrent,
      createdBy: await getOperator(req),
    },
  });
  return json({ portal: { id: portal.id, token: portal.token } }, { status: 201 });
});
