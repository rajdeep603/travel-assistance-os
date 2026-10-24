import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { refreshDemo } from "../../scripts/demo-refresh";

// The demo refresh against the seeded database: test records go, seeded ones
// stay, and moving the history away and back again restores every date and text.

const prisma = new PrismaClient();
const quiet = () => {};

afterAll(async () => {
  await prisma.$disconnect();
});

/** The dates and texts the refresh rewrites, for a before/after comparison. */
async function snapshot() {
  const [cases, calls, conversations, patients, leads] = await Promise.all([
    prisma.case.findMany({ select: { ref: true, aiSummary: true, createdAt: true, priority: true }, orderBy: { ref: "asc" } }),
    prisma.call.findMany({ select: { ref: true, summary: true, startedAt: true, outcome: true }, orderBy: { ref: "asc" } }),
    prisma.conversation.findMany({ select: { id: true, messages: true }, orderBy: { id: "asc" } }),
    prisma.patient.findMany({ select: { ref: true, dateOfBirth: true }, orderBy: { ref: "asc" } }),
    prisma.lead.findMany({ select: { id: true, createdAt: true }, orderBy: { id: "asc" } }),
  ]);
  return { cases, calls, conversations, patients, leads };
}

describe("demo refresh", () => {
  it("removes records the seed didn't create, and nothing else", async () => {
    const patient = await prisma.patient.findUniqueOrThrow({ where: { ref: "PAT-1001" } });
    const conversation = await prisma.conversation.create({ data: { channel: "PHONE", messages: [] } });
    const kase = await prisma.case.create({
      data: { ref: "CASE-9901", title: "Rehearsal case", description: "test", location: "Taksim", patientId: patient.id, events: { create: { type: "NOTE", title: "test" } } },
    });
    await prisma.call.create({ data: { ref: "CALL-9901", direction: "INBOUND", channel: "PHONE", agentProfile: "inbound-hotline", status: "COMPLETED", caseId: kase.id, conversationId: conversation.id } });
    const lonely = await prisma.patient.create({
      data: { ref: "PAT-9901", firstName: "Unregistered", lastName: "Traveller", dateOfBirth: new Date("1990-01-01"), nationality: "Unknown", language: "en", phone: "+0000", email: "test@demo.example", policyNumber: "POL-TEST-9901" },
    });
    const before = { cases: await prisma.case.count(), calls: await prisma.call.count() };

    const dry = await refreshDemo(prisma, { shift: false, log: quiet });
    expect(dry.removed.cases).toEqual(["CASE-9901"]);
    expect(dry.removed.calls).toEqual(["CALL-9901"]);
    expect(dry.removed.patients).toEqual(["PAT-9901"]);
    expect(await prisma.case.count()).toBe(before.cases); // a dry run changes nothing

    await refreshDemo(prisma, { apply: true, shift: false, log: quiet });
    expect(await prisma.case.findUnique({ where: { ref: "CASE-9901" } })).toBeNull();
    expect(await prisma.call.findUnique({ where: { ref: "CALL-9901" } })).toBeNull();
    expect(await prisma.conversation.findUnique({ where: { id: conversation.id } })).toBeNull();
    expect(await prisma.patient.findUnique({ where: { id: lonely.id } })).toBeNull();
    expect(await prisma.patient.findUnique({ where: { id: patient.id } })).not.toBeNull();
    expect(await prisma.case.count()).toBe(before.cases - 1);
    expect(await prisma.call.count()).toBe(before.calls - 1);
  });

  it("brings an aged demo back to today, dates in text included", async () => {
    const original = await snapshot();
    const aged = await refreshDemo(prisma, { apply: true, tidy: false, ageDays: 9, log: quiet });
    expect(aged.shiftDays).toBe(-9);

    const old = await snapshot();
    const c1001 = (s: typeof old) => s.cases.find((c) => c.ref === "CASE-1001")!;
    expect(c1001(original).createdAt.getTime() - c1001(old).createdAt.getTime()).toBe(9 * 86_400_000);
    expect(c1001(old).aiSummary).not.toBe(c1001(original).aiSummary); // "from 18 to 20 October" moved too
    expect(old.patients).toEqual(original.patients); // birth dates are facts
    expect(old.leads).toEqual(original.leads); // visitors are real

    const fresh = await refreshDemo(prisma, { apply: true, tidy: false, log: quiet });
    expect(fresh.shiftDays).toBe(9);
    expect(await snapshot()).toEqual(original);
  });
});
