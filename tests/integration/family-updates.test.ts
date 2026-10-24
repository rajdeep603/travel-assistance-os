import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { familyUpdates, notifyFamily, sendFamilyUpdate } from "@/lib/services/family-updates";

// Updates to the family against the seeded database: CASE-1024's daughter has
// had hers, a fictional number is only simulated, and automatic updates go out
// only when they are switched on.

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

const caseByRef = (ref: string) => prisma.case.findUniqueOrThrow({ where: { ref } });

describe("updates to the family", () => {
  it("shows the daughter's updates on CASE-1024, newest first", async () => {
    const kase = await caseByRef("CASE-1024");
    const data = await familyUpdates(kase.id);
    expect(data.contact).toMatchObject({ name: "Grace Bennett", relation: "Daughter", automatic: true });
    expect(data.maskedPhone).not.toContain("900218");
    expect(data.updates).toHaveLength(3);
    expect(data.updates[0].text).toContain("guarantee of payment (LOG-0903)");
    expect(data.updates.every((u) => u.simulated)).toBe(true);
    expect(data.suggestion).toContain("guarantee of payment");
  });

  it("records an update to a fictional number without sending it, and files it on the case", async () => {
    const kase = await caseByRef("CASE-1024");
    const message = await sendFamilyUpdate(kase.id, "Oliver is resting; the doctors will call you after the morning round.", { actor: "demo" });
    expect(message).toMatchObject({ channel: "WHATSAPP", status: "SENT", provider: "mock", automatic: false });
    const event = await prisma.caseEvent.findFirstOrThrow({ where: { caseId: kase.id, type: "WHATSAPP" }, orderBy: { createdAt: "desc" } });
    expect(event.title).toBe("Update sent to Grace Bennett (daughter) on WhatsApp");
  });

  it("sends the automatic update only when it is switched on", async () => {
    const kase = await caseByRef("CASE-1012");
    const count = () => prisma.outboundMessage.count({ where: { caseId: kase.id, channel: "WHATSAPP" } });
    await prisma.case.update({ where: { id: kase.id }, data: { familyContactName: "Jan Van Dijk", familyContactPhone: "+31600000001", familyUpdates: false } });
    const before = await count();
    await notifyFamily(kase.id, "closed");
    expect(await count()).toBe(before);
    await prisma.case.update({ where: { id: kase.id }, data: { familyUpdates: true } });
    await notifyFamily(kase.id, "closed");
    expect(await count()).toBe(before + 1);
    const last = await prisma.outboundMessage.findFirstOrThrow({ where: { caseId: kase.id, channel: "WHATSAPP" }, orderBy: { createdAt: "desc" } });
    expect(last.body).toMatch(/^Case CASE-1012 for .+ is now closed\./);
    expect(last.automatic).toBe(true);
    await prisma.case.update({ where: { id: kase.id }, data: { familyContactName: null, familyContactPhone: null, familyUpdates: false } });
  });
});
