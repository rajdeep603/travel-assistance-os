import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ASSUMPTIONS, DEFAULT_COST_CONTAINMENT, DEFAULT_INPUTS, DEFAULT_RUNNING_COST_PRICES } from "@/lib/business-case";
import { MockFax, setFaxService } from "@/lib/services/fax";
import { MockEmail, setEmailService, type EmailMessage, type EmailService } from "@/lib/services/email";
import { deleteDocument, deleteInboundMessage } from "@/lib/services/erase";
import { createLead, followUpDraft, sendFollowUp, updateLead, LeadUpdateSchema } from "@/lib/services/leads";
import { getShiftHandover, nightOf } from "@/lib/services/shift-handover";

// Meeting notes and the same-day follow-up on a lead; removing a visitor's
// file with everything derived from it; the night-shift handover from the
// seeded records.

const prisma = new PrismaClient();
const testStart = new Date();

class RealProvider implements EmailService {
  readonly name = "real-test";
  readonly configured = true;
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
    return { id: `real_${this.sent.length}` };
  }
}

const input = {
  operation: DEFAULT_INPUTS,
  assumptions: DEFAULT_ASSUMPTIONS,
  prices: DEFAULT_RUNNING_COST_PRICES,
  costContainment: DEFAULT_COST_CONTAINMENT,
  quote: { customerName: "Ayşe Demir", companyName: "Notes Test Assistance", email: "", phone: "", services: [], pilot: "status-calls" },
};

afterEach(() => {
  setEmailService(null);
  setFaxService(null);
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.outboundMessage.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.$disconnect();
});

describe("meeting notes and the follow-up", () => {
  it("keeps the notes and drafts a recap from them", async () => {
    const { lead } = await createLead({ input, operator: "presenter" });
    expect(lead.pilot).toBe("status-calls");
    const changes = LeadUpdateSchema.parse({
      email: "ayse@notes-test-assistance.com",
      segment: "assistance",
      pains: ["after-hours", "languages", "after-hours"],
      notes: "Runs 40 seats in Izmir; COO decides.",
      nextStep: "Call with their COO",
      nextStepOn: "2026-11-10",
    });
    const saved = await updateLead(lead.id, changes);
    expect(saved).toMatchObject({ segment: "assistance", pains: ["after-hours", "languages"], nextStep: "Call with their COO" });
    expect(saved.nextStepOn?.toISOString().slice(0, 10)).toBe("2026-11-10");

    setEmailService(new RealProvider());
    const draft = await followUpDraft(lead.id);
    expect(draft.blocked).toBeNull();
    expect(draft.to).toBe("ayse@notes-test-assistance.com");
    expect(draft.text).toContain("Dear Ayşe Demir,");
    expect(draft.text).toContain("- Night shifts and peak call volume");
    expect(draft.text).toContain("60-day pilot, “Where is my case?” and after-hours calls");
    expect(draft.text).toContain("Next step: Call with their COO, 10 November 2026.");
  });

  it("sends the follow-up as edited, with the quotation, and marks the lead contacted", async () => {
    const { lead } = await createLead({ input: { ...input, quote: { ...input.quote, companyName: "Follow-up Test Assistance", email: "buyer@follow-up-test.com" } }, operator: null });
    const provider = new RealProvider();
    setEmailService(provider);
    const updated = await sendFollowUp(lead.id, { subject: "Our meeting today", text: "Dear Ayşe,\n\nThank you." }, "presenter");
    expect(updated.status).toBe("CONTACTED");
    expect(updated.followUpSentAt).toBeInstanceOf(Date);
    const sent = provider.sent.at(-1)!;
    expect(sent).toMatchObject({ to: "buyer@follow-up-test.com", subject: "Our meeting today", text: "Dear Ayşe,\n\nThank you." });
    expect(sent.attachments?.[0].filename).toMatch(/\.pdf$/);
  });

  it("won't send without an address or an e-mail service", async () => {
    const { lead } = await createLead({ input: { ...input, quote: { ...input.quote, companyName: "No Address Assistance" } }, operator: null });
    setEmailService(new RealProvider());
    expect((await followUpDraft(lead.id)).blocked).toMatch(/e-mail address/);
    await expect(sendFollowUp(lead.id, { subject: "x", text: "y" }, null)).rejects.toMatchObject({ status: 400 });
    setEmailService(new MockEmail());
    await expect(sendFollowUp(lead.id, { subject: "x", text: "y" }, null)).rejects.toMatchObject({ status: 503 });
  });
});

describe("removing a visitor's file", () => {
  it("deletes a message with its documents, extraction, bill review, replies and timeline entries", async () => {
    setEmailService(new MockEmail());
    setFaxService(new MockFax());
    const { POST } = await import("@/app/api/inbox/simulate/route");
    const res = await POST(
      new Request("http://app/api/inbox/simulate", { method: "POST", body: JSON.stringify({ kind: "email", sample: "hospital-final-invoice" }) }),
      {}
    );
    expect(res.status).toBe(201);
    const { message } = await res.json();
    const docs = await prisma.document.findMany({ where: { inboundMessageId: message.id }, select: { id: true } });
    expect(docs.length).toBeGreaterThan(0);
    expect(await prisma.billReview.count({ where: { documentId: { in: docs.map((d) => d.id) } } })).toBeGreaterThan(0);

    await deleteInboundMessage(message.id);
    expect(await prisma.inboundMessage.findUnique({ where: { id: message.id } })).toBeNull();
    expect(await prisma.document.count({ where: { id: { in: docs.map((d) => d.id) } } })).toBe(0);
    expect(await prisma.billReview.count({ where: { documentId: { in: docs.map((d) => d.id) } } })).toBe(0);
    expect(await prisma.outboundMessage.count({ where: { inReplyToId: message.id } })).toBe(0);
    expect(await prisma.caseEvent.count({ where: { data: { path: ["messageRef"], equals: message.ref } } })).toBe(0);
  });

  it("deletes an uploaded document and its stored file", async () => {
    const dir = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
    fs.mkdirSync(dir, { recursive: true });
    const name = `erase-test-${Date.now()}.txt`;
    fs.writeFileSync(path.join(dir, name), "Patient: Test");
    const doc = await prisma.document.create({
      data: { filename: name, mimeType: "text/plain", sizeBytes: 13, status: "PROCESSED", storagePath: `uploads/${name}` },
    });
    await deleteDocument(doc.id);
    expect(await prisma.document.findUnique({ where: { id: doc.id } })).toBeNull();
    expect(fs.existsSync(path.join(dir, name))).toBe(false);
    await expect(deleteDocument(doc.id)).rejects.toMatchObject({ status: 404 });
  });

  it("keeps a generated Letter of Guarantee", async () => {
    const letter = await prisma.guaranteeLetter.findFirst({ where: { pdfDocumentId: { not: null } }, select: { pdfDocumentId: true } });
    if (!letter?.pdfDocumentId) return;
    await expect(deleteDocument(letter.pdfDocumentId)).rejects.toMatchObject({ status: 409 });
  });
});

describe("night-shift handover", () => {
  it("opens on the busiest recent night, in order, with the emergency put through", async () => {
    const shown = await getShiftHandover();
    expect(shown).not.toBeNull();
    const busiest = Math.max(...shown!.nights.map((n) => n.activity));
    expect(shown!.nights.find((n) => n.night === shown!.night)?.activity).toBe(busiest);

    // The seeded night shift: six calls in six languages, one put through to the doctor.
    const seeded = await prisma.call.findUniqueOrThrow({ where: { ref: "CALL-0918" } });
    const shift = await getShiftHandover({ night: nightOf(seeded.startedAt) });
    expect(shift!.calls.total).toBeGreaterThanOrEqual(6);
    expect(shift!.calls.emergencies).toBeGreaterThanOrEqual(1);
    expect(shift!.calls.languages).toEqual(expect.arrayContaining(["Dutch", "Italian", "Russian", "Spanish", "Turkish"]));

    // The seeded emergency: Lena Koch's husband at 07:05 on the morning after a night.
    const emergency = await prisma.call.findFirst({ where: { status: "TRANSFERRED", transferredTo: "doctor" }, orderBy: { startedAt: "desc" } });
    const night = emergency && nightOf(emergency.startedAt);
    if (!night) return;
    const h = await getShiftHandover({ night });
    expect(h!.night).toBe(night);
    expect(h!.calls.emergencies).toBeGreaterThan(0);
    const times = h!.events.map((e) => e.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(h!.events.some((e) => e.tone === "emergency")).toBe(true);
  });

  it("falls back to the latest night for a night without activity", async () => {
    const h = await getShiftHandover({ night: "1999-01-01" });
    expect(h?.night).not.toBe("1999-01-01");
  });
});
