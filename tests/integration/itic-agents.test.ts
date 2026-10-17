import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { processInbound, receiveInbound } from "@/lib/intake/intake";
import { EMAIL_SAMPLES } from "@/lib/intake/samples";
import { decideBillReview } from "@/lib/services/bill-review-service";
import { negotiationBrief, reviewToNegotiate } from "@/lib/services/bill-negotiation";
import { MockEmail, setEmailService } from "@/lib/services/email";
import { caseMoney } from "@/lib/services/exposure";
import { MockFax, setFaxService } from "@/lib/services/fax";
import { globalSearch } from "@/lib/services/search";
import { getAgent } from "@/lib/voice/agents/registry";
import { closeOrphanedCalls } from "@/lib/voice/retention";
import { executeTool } from "@/lib/voice/tools/registry";
import type { ToolContext } from "@/lib/voice/tools/types";

// The voice agents and e-mail flows added for the ITIC meetings, against the
// seeded database: the hospital line (find, re-send, top-up), "where is my
// case?", bill negotiation, medical transport, the localized status e-mail,
// the hospital's guarantee enquiry, browser rehearsals of outbound agents,
// closing calls a crashed gateway left open, and global search.

const prisma = new PrismaClient();
const testStart = new Date();
const mail = new MockEmail();
const fax = new MockFax();
const createdCalls: string[] = [];
let seeded: { case1022: { status: string; assistanceType: string } } | null = null;

function toolCtx(profileId: string, caseId: string | null = null) {
  const outcome: Record<string, unknown> = {};
  const events: Record<string, unknown>[] = [];
  const ctx: ToolContext = {
    callId: "itic-test",
    callRef: "CALL-TEST",
    conversationId: "itic-test",
    profileId,
    channel: "BROWSER",
    caseId,
    patientId: null,
    async setCase(id, patientId) {
      ctx.caseId = id;
      ctx.patientId = patientId;
    },
    async setOutcome(patch) {
      Object.assign(outcome, patch);
    },
    emit(event) {
      events.push(event);
    },
    actions: {
      async hangup() {},
      async transfer() {
        return { ok: false, message: "" };
      },
    },
  };
  const run = (name: string, args: unknown) => executeTool(name, args, ctx, getAgent(profileId)!.tools);
  return { ctx, outcome, events, run };
}

async function receive(sampleId: string, override: { from?: string } = {}) {
  const s = EMAIL_SAMPLES.find((e) => e.id === sampleId)!;
  const files = s.attachments.map((rel) => ({ filename: path.basename(rel), buffer: fs.readFileSync(path.join(process.cwd(), "public", rel)) }));
  const message = await receiveInbound({ channel: "EMAIL", from: override.from ?? s.from, to: s.to, subject: s.subject, body: s.body, files });
  return processInbound(message.id, files);
}

beforeAll(async () => {
  setEmailService(mail);
  setFaxService(fax);
  const kase = await prisma.case.findUniqueOrThrow({ where: { ref: "CASE-1022" } });
  seeded = { case1022: { status: kase.status, assistanceType: kase.assistanceType } };
});

afterAll(async () => {
  setEmailService(null);
  setFaxService(null);
  if (seeded) {
    await prisma.case.update({
      where: { ref: "CASE-1022" },
      data: { status: seeded.case1022.status as never, assistanceType: seeded.case1022.assistanceType as never },
    });
  }
  // Seeded letters carry no PDF; put LOG-0902 back that way.
  const log902 = await prisma.guaranteeLetter.findUnique({ where: { ref: "LOG-0902" } });
  if (log902?.pdfDocumentId) await prisma.guaranteeLetter.update({ where: { id: log902.id }, data: { pdfDocumentId: null } });
  await prisma.transportPlan.deleteMany({ where: { createdAt: { gte: testStart } } });
  const msgs = await prisma.inboundMessage.findMany({ where: { createdAt: { gte: testStart } } });
  await prisma.outboundMessage.deleteMany({ where: { createdAt: { gte: testStart } } });
  const docs = await prisma.document.findMany({ where: { createdAt: { gte: testStart } } });
  await prisma.documentExtraction.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
  await prisma.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
  await prisma.inboundMessage.deleteMany({ where: { id: { in: msgs.map((m) => m.id) } } });
  await prisma.claim.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.caseEvent.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.call.deleteMany({ where: { id: { in: createdCalls } } });
  await prisma.$disconnect();
});

describe("hospital & provider line", () => {
  it("finds the guarantee only for the hospital it was issued to", async () => {
    const other = toolCtx("inbound-provider-line");
    const refused = await other.run("find_guarantee", { hospital: "Besiktas Sports Medicine", patient_name: "Lena Koch", date_of_birth: "1964-07-29" });
    expect(refused).toMatchObject({ found: false });
    expect(other.ctx.caseId).toBeNull();

    const t = toolCtx("inbound-provider-line");
    const found = await t.run("find_guarantee", { hospital: "Marmara Heart Center", patient_name: "Lena Koch", date_of_birth: "1964-07-29" });
    expect(found).toMatchObject({ found: true, case_ref: "CASE-1022", letters: [expect.objectContaining({ ref: "LOG-0902", guaranteed_amount: "11,850 EUR" })] });
    expect(t.ctx.caseId).not.toBeNull();

    // Re-sending renders the seeded letter's missing PDF and faxes it to the number on file.
    const resent = await t.run("resend_guarantee", { letter_ref: "LOG-0902" });
    expect(resent).toMatchObject({ sent: true, say: expect.stringContaining("ending in 2 0 0 5") });
    expect(fax.sent.at(-1)).toMatchObject({ to: "+902120002005", filename: "letter-of-guarantee-log-0902.pdf" });
    expect((await prisma.guaranteeLetter.findUniqueOrThrow({ where: { ref: "LOG-0902" } })).pdfDocumentId).not.toBeNull();

    const topUp = await t.run("request_guarantee_increase", { letter_ref: "LOG-0902", new_estimated_total: 15500, currency: "EUR", reason: "stent added", extra_days: 2 });
    expect(topUp).toMatchObject({ recorded: true });
    const event = await prisma.caseEvent.findFirstOrThrow({ where: { caseId: t.ctx.caseId!, createdAt: { gte: testStart }, title: { contains: "asks to raise LOG-0902" } } });
    expect(event.title).toContain("11,850 → 15,500 EUR");
    expect(t.outcome).toMatchObject({ guaranteeEnquiry: { letters: ["LOG-0902"] }, guaranteeResent: { ref: "LOG-0902", via: "FAX" } });
  });
});

describe("where is my case?", () => {
  it("finds the caller's open case from their name and date of birth", async () => {
    const t = toolCtx("inbound-hotline");
    expect(await t.run("find_my_case", { full_name: "James Carter", date_of_birth: "1980-11-02" })).toMatchObject({ found: false });
    const found = await t.run("find_my_case", { full_name: "james carter", date_of_birth: "1979-11-02" });
    expect(found).toMatchObject({ found: true, case_ref: "CASE-1017", status: "in progress" });
    expect(t.outcome).toEqual({ statusGiven: { caseRef: "CASE-1017" } });
  });
});

describe("bill negotiation", () => {
  it("records what the hospital agreed, within the agent's limit only, and counts the realised saving", async () => {
    const invoice = await receive("hospital-final-invoice");
    expect(invoice.matchedCaseId).not.toBeNull();
    const caseId = invoice.matchedCaseId!;
    const brief = await negotiationBrief(caseId);
    expect(brief).toMatchObject({ your_opening_offer: "7,582.50 EUR", your_second_offer: "8,190.00 EUR", private_limit: expect.stringContaining("8,790.00 EUR") });

    const t = toolCtx("outbound-bill-negotiation", caseId);
    expect(await t.run("record_bill_agreement", { outcome: "AGREED", agreed_amount: 9500, hold_harmless: true })).toMatchObject({ outcome: "COUNTER_OFFER" });
    expect(await t.run("record_bill_agreement", { outcome: "AGREED", agreed_amount: 8600, hold_harmless: false })).toMatchObject({ outcome: "COUNTER_OFFER" });
    expect(await t.run("record_bill_agreement", { outcome: "AGREED", agreed_amount: 8600, hold_harmless: true, contact_name: "Ayşe Demir" })).toMatchObject({ outcome: "AGREED" });

    const review = (await reviewToNegotiate(caseId))!;
    expect(Number(review.agreedAmount)).toBe(8600);
    expect(review.agreement).toMatchObject({ outcome: "AGREED", holdHarmless: true, contact: "Ayşe Demir", callRef: "CALL-TEST" });
    await decideBillReview(review.id, "ACCEPTED", "test");
    const money = (await caseMoney(caseId))!;
    expect(money.savingsAccepted).toBe(12385 - 8600);
  });
});

describe("medical transport", () => {
  it("plans the least intensive safe transport and asks providers to quote", async () => {
    const kase = await prisma.case.findUniqueOrThrow({ where: { ref: "CASE-1022" } });
    const t = toolCtx("outbound-medical-transport", kase.id);
    const before = mail.sent.length;
    const result = await t.run("record_transport_assessment", {
      diagnosis: "Unstable angina after one stent",
      fit_to_fly: "FROM_DATE",
      fit_from: "Monday",
      mobility: "STRETCHER",
      oxygen_lpm: 2,
      monitoring: "BASIC",
      intensive_care: false,
      escort: "DOCTOR",
      destination: "Hamburg",
    });
    expect(result).toMatchObject({ saved: true, recommended: "Stretcher on a scheduled flight" });
    const plan = await prisma.transportPlan.findFirstOrThrow({ where: { caseId: kase.id, createdAt: { gte: testStart } } });
    expect(plan).toMatchObject({ mode: "COMMERCIAL_STRETCHER", status: "QUOTES_REQUESTED", currency: "EUR" });
    expect(mail.sent.slice(before).map((m) => m.to)).toEqual(["Demo Air Ambulance Europe <quotes@demo-airambulance.example>", "Demo MedEscort <ops@demo-medescort.example>"]);
    // The quote request carries the clinical facts, not the patient's name.
    expect(mail.sent.at(-1)!.text).toContain("Patient: L.K.");
    expect(mail.sent.at(-1)!.text).not.toContain("Lena Koch");
    expect((await prisma.case.findUniqueOrThrow({ where: { id: kase.id } })).assistanceType).toBe("REPATRIATION");
  });
});

describe("e-mail: status and guarantee enquiries", () => {
  it("answers a Spanish 'where is my case?' in Spanish, from the records", async () => {
    const msg = await receive("traveller-status-es");
    expect(msg).toMatchObject({ status: "REPLIED", language: "es" });
    const reply = mail.sent.at(-1)!;
    expect(reply.to).toContain("carlos.garcia@example.com");
    expect(reply.text).toContain("Su caso CASE-1015 está en curso.");
    expect(reply.text).toContain("— English —");
  });

  it("answers a hospital's guarantee enquiry with the letter attached", async () => {
    const msg = await receive("hospital-gop-enquiry");
    expect(msg.status).toBe("REPLIED");
    const reply = mail.sent.at(-1)!;
    expect(reply.text).toContain("Letter of Guarantee LOG-0902: €11,850.00, valid until 21 October 2026");
    expect(reply.attachments?.map((a) => a.filename)).toEqual(["letter-of-guarantee-log-0902.pdf"]);
  });

  it("holds an enquiry from anyone but that hospital for a person", async () => {
    const before = mail.sent.length;
    const msg = await receive("hospital-gop-enquiry", { from: "Billing <billing@other-hospital.example>" });
    expect(msg.status).toBe("NEEDS_REVIEW");
    expect(mail.sent.length).toBe(before);
  });
});

describe("voice sessions", () => {
  it("rehearses an outbound agent in the browser with its brief and language", async () => {
    const { POST } = await import("@/app/api/voice/session/route");
    const kase = await prisma.case.findUniqueOrThrow({ where: { ref: "CASE-1022" } });
    const post = (body: unknown) => POST(new Request("http://app/api/voice/session", { method: "POST", body: JSON.stringify(body) }), {});
    const noCase = await post({ profile: "outbound-medical-transport" });
    expect(noCase.status).toBe(400);
    const res = await post({ profile: "outbound-medical-transport", caseId: kase.id, language: "es" });
    expect(res.status).toBe(201);
    const { call } = await res.json();
    createdCalls.push(call.id);
    const stored = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(stored).toMatchObject({ language: "Spanish", channel: "BROWSER", direction: "OUTBOUND" });
    expect(stored.outcome).toMatchObject({ brief: { case: "CASE-1022", patient: expect.stringContaining("Lena Koch") } });
  });

  it("closes calls a crashed gateway left open, and leaves live phone calls alone", async () => {
    const minuteAgo = new Date(Date.now() - 60_000);
    const browser = await prisma.call.create({
      data: { ref: `CALL-T${Date.now()}`, direction: "INBOUND", channel: "BROWSER", agentProfile: "inbound-hotline", status: "IN_PROGRESS", answeredAt: minuteAgo, createdAt: minuteAgo },
    });
    const phone = await prisma.call.create({
      data: { ref: `CALL-P${Date.now()}`, direction: "INBOUND", channel: "PHONE", agentProfile: "inbound-hotline", status: "IN_PROGRESS", answeredAt: minuteAgo, createdAt: minuteAgo },
    });
    createdCalls.push(browser.id, phone.id);
    expect(await closeOrphanedCalls(new Date())).toBeGreaterThanOrEqual(1);
    expect(await prisma.call.findUniqueOrThrow({ where: { id: browser.id } })).toMatchObject({
      status: "COMPLETED",
      outcome: { endReason: "session lost when the voice service restarted" },
    });
    expect((await prisma.call.findUniqueOrThrow({ where: { id: phone.id } })).status).toBe("IN_PROGRESS");
  });
});

describe("global search", () => {
  it("puts an exact reference first and matches names word by word", async () => {
    expect((await globalSearch("LOG-0902"))[0]).toMatchObject({ kind: "guarantee", ref: "LOG-0902" });
    const lena = await globalSearch("koch lena");
    expect(lena.map((h) => h.kind)).toEqual(expect.arrayContaining(["case", "traveller"]));
    expect(lena.find((h) => h.kind === "traveller")).toMatchObject({ title: "Lena Koch", href: expect.stringMatching(/^\/cases\//) });
    expect(await globalSearch("x")).toEqual([]);
  });
});
