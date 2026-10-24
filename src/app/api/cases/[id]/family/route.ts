import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { familyUpdates, sendFamilyUpdate } from "@/lib/services/family-updates";

export const dynamic = "force-dynamic";

async function caseId(idOrRef: string): Promise<string> {
  const found = await prisma.case.findFirst({ where: { OR: [{ id: idOrRef }, { ref: idOrRef.toUpperCase() }] }, select: { id: true } });
  if (!found) throw notFound("Case");
  return found.id;
}

/** The family contact, the updates sent to them and a suggested next one. */
export const GET = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  return json(await familyUpdates(await caseId(params.id)));
});

const contactSchema = z.object({
  name: z.string().trim().max(120).nullable().optional(),
  relation: z.string().trim().max(60).nullable().optional(),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^\+?[\d\s().-]{6,}$/, "Enter the phone number with its country code, e.g. +44 7700 900218.")
    .nullable()
    .optional(),
  language: z.string().trim().max(40).nullable().optional(),
  automatic: z.boolean().optional(),
});

/** Sets the family contact, or switches automatic updates on or off. */
export const PATCH = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const body = contactSchema.parse(await req.json().catch(() => ({})));
  const id = await caseId(params.id);
  const blank = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
  await prisma.case.update({
    where: { id },
    data: {
      familyContactName: blank(body.name),
      familyContactRelation: blank(body.relation),
      familyContactPhone: blank(body.phone),
      familyContactLanguage: blank(body.language),
      familyUpdates: body.automatic,
    },
  });
  return json(await familyUpdates(id));
});

/** Sends an update to the family now. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const body = z.object({ text: z.string().trim().max(1000) }).parse(await req.json().catch(() => ({})));
  if (!body.text) throw badRequest("Write the update first.");
  const message = await sendFamilyUpdate(await caseId(params.id), body.text, { actor: await getOperator(req) });
  return json({ message: serialize(message) }, { status: 201 });
});
