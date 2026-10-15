import type { GuaranteeLetter } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";

// Status changes that don't need PDF generation (kept apart from
// guarantee-letter.ts so the voice gateway doesn't bundle pdfkit).

const actorOf = (by: string) => (by.startsWith("system") || by.startsWith("agent:") ? by : `operator:${by}`);

/** The hospital confirmed receipt (operator, or the AI confirmation call). */
export async function acknowledgeLetter(id: string, by: string, note?: string): Promise<GuaranteeLetter> {
  const letter = await prisma.guaranteeLetter.findUnique({ where: { id } });
  if (!letter) throw notFound("Letter of Guarantee");
  if (letter.status !== "SENT") throw conflict(`${letter.ref} hasn't been sent yet.`);
  const updated = await prisma.guaranteeLetter.update({ where: { id }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() } });
  await prisma.caseEvent.create({
    data: { caseId: letter.caseId, type: "LETTER_OF_GUARANTEE", title: `${letter.hospitalName} confirmed receipt of ${letter.ref}`, body: note ?? null, actor: actorOf(by) },
  });
  return updated;
}
