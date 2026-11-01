import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { EMAIL_SAMPLES } from "@/lib/intake/samples";
import { receiveSample } from "@/lib/intake/simulate";
import { deleteInboundMessage } from "@/lib/services/erase";

// A bundled sample received again (the next meeting) replaces its previous
// copy and what that copy produced, so the seeded case shows one of each.

const prisma = new PrismaClient();
const TAGS = ["sample:email:hospital-final-invoice:", "sample:email:new-claim-bills:"];

/** Claims whose history says a given message opened them. */
async function claimsOpenedBy(caseId: string, messageRef: string) {
  const claims = await prisma.claim.findMany({ where: { caseId }, select: { id: true, history: true } });
  return claims.filter((c) => Array.isArray(c.history) && (c.history as { action?: unknown }[]).some((h) => typeof h.action === "string" && h.action.includes(messageRef)));
}

afterAll(async () => {
  await prisma.inboundMessage.deleteMany({ where: { ref: "MSG-0999" } });
  for (const tag of TAGS) {
    for (const m of await prisma.inboundMessage.findMany({ where: { externalId: { startsWith: tag } }, select: { id: true } })) {
      await deleteInboundMessage(m.id, { replacingSample: true });
    }
  }
  await prisma.$disconnect();
});

describe("receiving a sample again", () => {
  it("replaces the previous copy of a hospital invoice: one message, one bill review", async () => {
    const first = await receiveSample("email", "hospital-final-invoice");
    const second = await receiveSample("email", "hospital-final-invoice");
    expect(second.id).not.toBe(first.id);
    expect(await prisma.inboundMessage.findUnique({ where: { id: first.id } })).toBeNull();
    const copies = await prisma.inboundMessage.findMany({ where: { externalId: { startsWith: TAGS[0] } }, select: { id: true } });
    expect(copies.map((c) => c.id)).toEqual([second.id]);
    const reviews = await prisma.billReview.count({ where: { document: { inboundMessage: { externalId: { startsWith: TAGS[0] } } } } });
    expect(reviews).toBe(1);
    // The first copy's timeline entry went with it; the second's is there.
    const events = await prisma.caseEvent.findMany({ where: { data: { path: ["messageRef"], equals: first.ref } } });
    expect(events).toHaveLength(0);
    expect(await prisma.caseEvent.count({ where: { data: { path: ["messageRef"], equals: second.ref } } })).toBe(1);
  });

  it("takes a claim the previous copy opened with it, never one with documents of its own", async () => {
    const first = await receiveSample("email", "new-claim-bills");
    const caseId = first.matchedCaseId!;
    const second = await receiveSample("email", "new-claim-bills");
    expect(await claimsOpenedBy(caseId, first.ref)).toHaveLength(0);
    expect((await claimsOpenedBy(caseId, second.ref)).length).toBeLessThanOrEqual(1);
    // No claim on the case is left without documents by the replacement.
    const empty = await prisma.claim.findMany({ where: { caseId, documents: { none: {} } }, select: { history: true } });
    expect(empty.filter((c) => JSON.stringify(c.history).includes(first.ref))).toHaveLength(0);
  });

  it("also replaces an older untagged copy of the sample, but never a seeded message", async () => {
    const sample = EMAIL_SAMPLES.find((e) => e.id === "hospital-final-invoice")!;
    // A copy from before copies were tagged, and a seeded twin (refs MSG-09xx are the seed's).
    const untagged = await prisma.inboundMessage.create({
      data: { ref: `MSG-T${Date.now() % 100000}`, channel: "EMAIL", fromAddress: sample.from, subject: sample.subject, bodyText: sample.body },
    });
    const seeded = await prisma.inboundMessage.upsert({
      where: { ref: "MSG-0999" },
      create: { ref: "MSG-0999", channel: "EMAIL", fromAddress: sample.from, subject: sample.subject, bodyText: sample.body },
      update: {},
    });
    await receiveSample("email", "hospital-final-invoice");
    expect(await prisma.inboundMessage.findUnique({ where: { id: untagged.id } })).toBeNull();
    expect(await prisma.inboundMessage.findUnique({ where: { id: seeded.id } })).not.toBeNull();
  });
});
