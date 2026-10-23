import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { processInbound, receiveInbound } from "@/lib/intake/intake";
import { EMAIL_SAMPLES, WHATSAPP_SAMPLES } from "@/lib/intake/samples";
import { MockEmail, setEmailService } from "@/lib/services/email";
import { MockFax, setFaxService } from "@/lib/services/fax";
import { advanceMission, bookQuote, receiveQuotes, recommendedQuote, type AirQuote } from "@/lib/services/air-ambulance";
import { reviewBillForDocument } from "@/lib/services/bill-review-service";
import { renderEob } from "@/lib/services/eob-pdf";
import { letterLanguageFor, renderGuaranteeLetter } from "@/lib/services/guarantee-pdf";
import { renderMedif } from "@/lib/services/medif-pdf";
import { handOffCase, partnerRespond, vendorOversight } from "@/lib/services/network";
import { findDuplicates, mergeProviders, undoMerge } from "@/lib/services/provider-network";
import { searchProviders } from "@/lib/services/provider-search";
import { chaseByEmail, payerReadyCheck, receivablesOverview, recordPayment, submitReceivable } from "@/lib/services/receivables";
import { recommendSettlement, settleClaim } from "@/lib/services/settlement";
import { recommendTransport } from "@/lib/services/transport";
import { createEndpoint, emitEvent, verifySignature } from "@/lib/services/webhooks";
import { countryOf, emergencyNumber, findCity } from "@/lib/services/nlu";
import { directionOf, translate } from "@/lib/i18n";
import { getAgent } from "@/lib/voice/agents/registry";
import { executeTool } from "@/lib/voice/tools/registry";
import type { ToolContext } from "@/lib/voice/tools/types";
import { GET as getCaseV1 } from "@/app/api/v1/cases/[ref]/route";

// The features built for the booked ITIC meetings, against the seeded
// database: regional samples, settlement and the EOB, the receivables desk,
// provider clean-up and network rates, WhatsApp intake, partner hand-offs and
// oversight, air ambulance quotes and missions, the public API and webhooks,
// and the interface language. Everything changed here is put back afterwards.

const prisma = new PrismaClient();
const testStart = new Date();
const mail = new MockEmail();
const fax = new MockFax();

function toolCtx(profileId: string, caseId: string | null = null) {
  const outcome: Record<string, unknown> = {};
  const ctx: ToolContext = {
    callId: "booked-test",
    callRef: "CALL-TEST",
    conversationId: "booked-test",
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
    emit() {},
    actions: {
      async hangup() {},
      async transfer() {
        return { ok: false, message: "" };
      },
    },
  };
  return { outcome, run: (name: string, args: unknown) => executeTool(name, args, ctx, getAgent(profileId)!.tools) };
}

const read = (rel: string) => ({ filename: path.basename(rel), buffer: fs.readFileSync(path.join(process.cwd(), "public", rel)) });

async function receiveEmail(sampleId: string) {
  const s = EMAIL_SAMPLES.find((e) => e.id === sampleId)!;
  const files = s.attachments.map(read);
  const message = await receiveInbound({ channel: "EMAIL", from: s.from, to: s.to, subject: s.subject, body: s.body, files });
  return processInbound(message.id, files);
}

async function receiveWhatsApp(sampleId: string) {
  const s = WHATSAPP_SAMPLES.find((w) => w.id === sampleId)!;
  const files = s.attachments.map(read);
  const message = await receiveInbound({ channel: "WHATSAPP", from: `whatsapp:${s.from.replace(/[^\d+]/g, "")}`, to: "whatsapp:assistance", body: s.body, files });
  return processInbound(message.id, files);
}

let restore: (() => Promise<void>)[] = [];

beforeAll(() => {
  setEmailService(mail);
  setFaxService(fax);
});

afterAll(async () => {
  setEmailService(null);
  setFaxService(null);
  for (const undo of restore.reverse()) await undo();
  // Records this file created.
  await prisma.webhookEndpoint.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.caseHandoff.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.outboundMessage.deleteMany({ where: { createdAt: { gte: testStart } } });
  const msgs = await prisma.inboundMessage.findMany({ where: { createdAt: { gte: testStart } }, select: { id: true } });
  await prisma.document.deleteMany({ where: { inboundMessageId: { in: msgs.map((m) => m.id) } } });
  await prisma.inboundMessage.deleteMany({ where: { id: { in: msgs.map((m) => m.id) } } });
  await prisma.claim.deleteMany({ where: { createdAt: { gte: testStart } } });
  // Letters whose PDF was rendered here go back to having none (it's rendered again on demand).
  const generated = (await prisma.document.findMany({ where: { createdAt: { gte: testStart }, source: "GENERATED" }, select: { id: true } })).map((d) => d.id);
  await prisma.guaranteeLetter.updateMany({ where: { pdfDocumentId: { in: generated } }, data: { pdfDocumentId: null } });
  await prisma.document.deleteMany({ where: { id: { in: generated } } });
  await prisma.caseEvent.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.$disconnect();
});

describe("regional demo content", () => {
  it("knows the regions' cities, countries and emergency numbers", () => {
    expect(findCity("staying at a resort in Punta Cana")).toBe("Punta Cana");
    expect(countryOf("Punta Cana")).toBe("Dominican Republic");
    expect(countryOf(findCity("dive centre near Hurghada"))).toBe("Egypt");
    expect(findCity("born in Tunisia")).toBeNull();
    expect(emergencyNumber("Egypt")).toBe("123");
    expect(emergencyNumber("South Africa")).toBe("10177");
  });

  it("plans transport in the Americas from Miami, in dollars", () => {
    const rec = recommendTransport({ diagnosis: "Pneumonia", fitToFly: true, mobility: "SEATED", oxygenLpm: 2, monitoring: "NONE", intensiveCare: false, escort: "NURSE", destinationCountry: "Canada", originCountry: "United States" });
    expect(rec).toMatchObject({ origin: "MIA", currency: "USD", distance: "MEDIUM_HAUL", mode: "COMMERCIAL_ESCORTED" });
  });
});

describe("claim settlement and the explanation of benefits", () => {
  it("settles the out-of-network US bill at the reference price, and issues the EOB", async () => {
    const claim = await prisma.claim.findUniqueOrThrow({ where: { ref: "CLM-10230" }, include: { documents: { include: { billReview: true } } } });
    const review = claim.documents.find((d) => d.billReview)!.billReview!;
    restore.push(async () => {
      await prisma.claim.update({ where: { id: claim.id }, data: { status: claim.status, settlement: undefined, eobDocumentId: null, history: claim.history ?? undefined } });
      await prisma.$executeRawUnsafe(`UPDATE "Claim" SET "settlement" = NULL WHERE id = $1`, claim.id);
      await prisma.billReview.update({ where: { id: review.id }, data: { status: review.status, decidedBy: review.decidedBy, decidedAt: review.decidedAt } });
    });

    const s = await recommendSettlement(claim.id);
    expect(s).toMatchObject({ currency: "USD", billed: 34655, notCovered: 125, allowed: 9214.67, payable: 9214.67, travellerPays: 125 });
    expect(s.attention.join(" ")).toMatch(/Out of network/);
    expect(s.checks.every((c) => c.ok)).toBe(true);
    expect(s.lines.find((l) => l.code === "0120")!.remarks.map((r) => r.split(" ")[0])).toEqual(["S1", "P1"]);

    const { claim: settled, eobDocumentId } = await settleClaim(claim.id, "test");
    expect(settled.status).toBe("APPROVED");
    const eob = await prisma.document.findUniqueOrThrow({ where: { id: eobDocumentId } });
    expect(eob.kind).toBe("EXPLANATION_OF_BENEFITS");
    expect((await prisma.billReview.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("ACCEPTED");
    await expect(settleClaim(claim.id, "test")).rejects.toThrow(/already settled/);
  });

  it("renders the EOB and a MEDIF as PDFs", async () => {
    const claim = await prisma.claim.findUniqueOrThrow({ where: { ref: "CLM-10230" } });
    const s = await recommendSettlement(claim.id);
    const eob = await renderEob({ claimRef: "CLM-10230", issuedOn: "2026-10-24", member: { name: "Robert Tremblay", dateOfBirth: "1954-01-22", policy: "POL-CA-400101", plan: "Premier" }, provider: "Atlantic Demo Medical Center", service: { from: "2026-10-14", to: "2026-10-18", diagnosis: "Pneumonia" }, settlement: s, approvedBy: "test" });
    expect(eob.subarray(0, 5).toString()).toBe("%PDF-");
    const medif = await renderMedif({ planRef: "MT-TEST", caseRef: "CASE-1008", issuedOn: "2026-10-24", passenger: { name: "Khalid Al Suwaidi", dateOfBirth: "1979-04-18", nationality: "United Arab Emirates" }, from: "Geneva, Switzerland", to: "Dubai", mode: "COMMERCIAL_STRETCHER", assessment: { diagnosis: "Tibial plateau fracture", fitToFly: true, mobility: "STRETCHER", oxygenLpm: 0, monitoring: "BASIC", intensiveCare: false, escort: "NURSE" }, treatingPhysician: "Dr. Luc Favre" });
    expect(medif.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("network rates and provider clean-up", () => {
  it("measures a hospital with network rates against them, not the reference", async () => {
    const doc = await prisma.document.create({ data: { filename: "invoice-khalid-al-suwaidi-geneva.pdf", mimeType: "application/pdf", sizeBytes: 1, status: "UPLOADED" } });
    const { processDocument } = await import("@/lib/services/document-extraction");
    await processDocument(doc.id, read("demo-documents/invoice-khalid-al-suwaidi-geneva.pdf").buffer);
    const review = (await reviewBillForDocument(doc.id))!;
    expect(review.ruleset).toContain("Swiss network agreement 2026");
    // Against the plain reference the same invoice comes to 11,987.03 CHF.
    expect(Number(review.recommended)).toBeGreaterThan(11987.03);
    await prisma.document.delete({ where: { id: doc.id } });
  });

  it("finds the two seeded duplicates, and nothing in Istanbul", async () => {
    const pairs = await findDuplicates();
    const refs = pairs.map((p) => [p.a.ref, p.b.ref].sort().join("+"));
    expect(refs).toEqual(expect.arrayContaining(["PRV-2027+PRV-2036", "PRV-2028+PRV-2037"]));
    expect(pairs.filter((p) => p.a.city === "Istanbul")).toEqual([]);
    expect(pairs[0].reasons.join(" ")).toMatch(/phone/i);
  });

  it("merges a duplicate out of search and undoes it", async () => {
    const [keep, dup] = await Promise.all(["PRV-2027", "PRV-2036"].map((ref) => prisma.provider.findUniqueOrThrow({ where: { ref } })));
    const merge = await mergeProviders(keep.id, dup.id, "test");
    const results = await searchProviders({ city: "Hurghada", specialty: "General Medicine", limit: 10 });
    expect(results.map((r) => r.provider.ref)).toEqual(["PRV-2027"]);
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: keep.id } })).aliases).toContain("Red Sea Demo Hosp.");
    await undoMerge(merge.id, "test");
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: dup.id } })).mergedIntoId).toBeNull();
    await prisma.providerMerge.delete({ where: { id: merge.id } });
  });

  it("offers a video consultation only when asked, with a join link on the booking", async () => {
    expect((await searchProviders({ city: "Istanbul", limit: 10 })).some((r) => r.provider.kind === "TELEMEDICINE")).toBe(false);
    const withVideo = await searchProviders({ city: "Istanbul", includeTelemedicine: true, limit: 30 });
    expect(withVideo.some((r) => r.provider.ref === "PRV-2038")).toBe(true);
  });
});

describe("the receivables desk", () => {
  it("adds up what's outstanding by age and payer", async () => {
    const o = await receivablesOverview();
    expect(o.outstandingEur).toBeGreaterThan(0);
    expect(o.byPayer.length).toBeGreaterThan(3);
    expect(o.overdueCount).toBeGreaterThan(0);
  });

  it("catches what payers send back before an invoice goes out", async () => {
    const draft = await prisma.receivable.findUniqueOrThrow({ where: { ref: "RCV-0902" } });
    const r = payerReadyCheck(draft);
    expect(r.ready).toBe(false);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual(expect.arrayContaining(["No comfort items billed to the payer", "No line billed twice", "Nights match the stay dates"]));
    expect(r.cleanAmount).toBeCloseTo(3067.17, 2);
    expect(payerReadyCheck(await prisma.receivable.findUniqueOrThrow({ where: { ref: "RCV-0901" } })).ready).toBe(true);
  });

  it("sends, chases and records payment", async () => {
    const before = await prisma.receivable.findUniqueOrThrow({ where: { ref: "RCV-0910" } });
    restore.push(async () => {
      await prisma.receivable.update({
        where: { id: before.id },
        data: { status: before.status, submittedAt: null, dueAt: null, paidAt: null, paidAmount: before.paidAmount, chases: before.chases ?? [], readiness: undefined },
      });
    });
    const sentBefore = mail.sent.length;
    expect((await submitReceivable("RCV-0910", "test")).status).toBe("SUBMITTED");
    await chaseByEmail("RCV-0910", "test");
    expect(mail.sent.slice(sentBefore).map((m) => m.subject)).toEqual([expect.stringMatching(/^Invoice CDH-FAT-2026-1544/), expect.stringMatching(/^Payment reminder/)]);
    expect((await recordPayment("RCV-0910", 4000, "test")).status).toBe("PARTIALLY_PAID");
    expect((await recordPayment("RCV-0910", 5200, "test")).status).toBe("PAID");
  });

  it("records the payer's answer from the follow-up call", async () => {
    const before = await prisma.receivable.findUniqueOrThrow({ where: { ref: "RCV-0905" } });
    restore.push(async () => {
      await prisma.receivable.update({ where: { id: before.id }, data: { status: before.status, chases: before.chases ?? [], payerAnswer: before.payerAnswer ?? undefined } });
      if (!before.payerAnswer) await prisma.$executeRawUnsafe(`UPDATE "Receivable" SET "payerAnswer" = NULL WHERE id = $1`, before.id);
    });
    const brief = await getAgent("outbound-payment-followup")!.buildRecordBrief!(null);
    expect(brief.invoice_ref).toBe("RCV-0905");
    const t = toolCtx("outbound-payment-followup");
    const result = await t.run("record_payment_status", { invoice_ref: "RCV-0905", status: "PAYMENT_SCHEDULED", expected_payment_date: "6 November", contact_name: "Accounts payable" });
    expect(result).toMatchObject({ saved: true });
    const after = await prisma.receivable.findUniqueOrThrow({ where: { ref: "RCV-0905" } });
    expect(after.status).toBe("APPROVED");
    expect(after.payerAnswer).toMatchObject({ status: "PAYMENT_SCHEDULED", expectedPaymentDate: "6 November" });
  });
});

describe("WhatsApp and the regional e-mails", () => {
  it("files a traveller's WhatsApp bill on her case and answers on WhatsApp", async () => {
    const msg = await receiveWhatsApp("wa-traveller-bill-punta-cana");
    expect(msg.status).toBe("REPLIED");
    const kase = await prisma.case.findUniqueOrThrow({ where: { ref: "CASE-1002" } });
    expect(msg.matchedCaseId).toBe(kase.id);
    const reply = await prisma.outboundMessage.findFirstOrThrow({ where: { inReplyToId: msg.id } });
    expect(reply).toMatchObject({ channel: "WHATSAPP", status: "SENT", automatic: true });
    expect(await prisma.caseEvent.count({ where: { caseId: kase.id, type: "WHATSAPP", createdAt: { gte: testStart } } })).toBe(1);
  });

  it("answers a Spanish WhatsApp in Spanish", async () => {
    const msg = await receiveWhatsApp("wa-traveller-status-es");
    expect(msg).toMatchObject({ status: "REPLIED", language: "es" });
    const reply = await prisma.outboundMessage.findFirstOrThrow({ where: { inReplyToId: msg.id } });
    expect(reply.body).toContain("CASE-1015");
  });

  it("answers a Brazilian hospital's guarantee question in Portuguese", async () => {
    const msg = await receiveEmail("hospital-gop-enquiry-pt");
    expect(msg).toMatchObject({ status: "REPLIED", language: "pt" });
    expect(mail.sent.at(-1)!.text).toContain("Garantia de pagamento LOG-0906");
  });

  it("reads a Tunisian clinic's French report and invoice", async () => {
    const msg = await receiveEmail("clinic-discharge-sousse-fr");
    const docs = await prisma.document.findMany({ where: { inboundMessageId: msg.id }, include: { billReview: true } });
    expect(docs.map((d) => d.kind).sort()).toEqual(["DISCHARGE_SUMMARY", "HOSPITAL_INVOICE"]);
    expect(docs.find((d) => d.kind === "DISCHARGE_SUMMARY")!.language).toBe("fr");
    expect(Number(docs.find((d) => d.kind === "HOSPITAL_INVOICE")!.billReview!.savings)).toBeGreaterThan(0);
  });
});

describe("partners: hand-offs and oversight", () => {
  it("hands a case to a correspondent, whose updates land on the timeline", async () => {
    const kase = await prisma.case.findUniqueOrThrow({ where: { ref: "CASE-1002" } });
    const partner = await prisma.networkPartner.findUniqueOrThrow({ where: { ref: "NP-02" } });
    const h = await handOffCase(kase.id, partner.id, "Outpatient consultation and the bill", "test");
    expect(mail.sent.at(-1)!.text).toContain(`/partner/${h.token}`);
    await expect(handOffCase(kase.id, partner.id, "Outpatient consultation and the bill", "test")).rejects.toThrow(/already has this case/);
    await expect(partnerRespond(h.token, { action: "UPDATE", note: "too early" })).rejects.toThrow(/Accept the case first/);
    await partnerRespond(h.token, { action: "ACCEPT", name: "Dr. Ruiz" });
    await partnerRespond(h.token, { action: "UPDATE", note: "Cast checked, patient comfortable.", eta: "Airport assistance Sat 09:30" });
    const done = await partnerRespond(h.token, { action: "COMPLETE" });
    expect(done.status).toBe("COMPLETED");
    const titles = (await prisma.caseEvent.findMany({ where: { caseId: kase.id, type: "HANDOFF", createdAt: { gte: testStart } } })).map((e) => e.title);
    expect(titles).toEqual(expect.arrayContaining([expect.stringMatching(/accepted/), expect.stringMatching(/posted an update/), expect.stringMatching(/completed/)]));
  });

  it("scores every assistance vendor from the records", async () => {
    const vendors = await vendorOversight();
    expect(vendors.map((v) => v.ref).sort()).toEqual(["NP-11", "NP-12", "NP-13"]);
    expect(vendors.reduce((s, v) => s + v.cases, 0)).toBeGreaterThanOrEqual(24);
  });
});

describe("air ambulance", () => {
  it("compares accredited operators' quotes, books one and follows the mission", async () => {
    const plan = await prisma.transportPlan.findUniqueOrThrow({ where: { ref: "MT-0901" } });
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: plan.caseId } });
    restore.push(async () => {
      await prisma.$executeRawUnsafe(`UPDATE "TransportPlan" SET "quotes" = NULL, "mission" = NULL, "status" = 'QUOTES_REQUESTED' WHERE id = $1`, plan.id);
      await prisma.case.update({ where: { id: kase.id }, data: { status: kase.status } });
    });
    const withQuotes = await receiveQuotes(plan.id);
    const quotes = withQuotes.quotes as unknown as AirQuote[];
    expect(quotes.map((q) => q.operator).sort()).toEqual(["Demo AirMed Europe", "Demo Budget Air Charter", "Demo Jet Rescue Gulf"]);
    const budget = quotes.find((q) => q.operator === "Demo Budget Air Charter")!;
    expect(budget.concerns).toEqual(expect.arrayContaining(["Not accredited by EURAMI or CAMTS"]));
    const best = recommendedQuote(quotes)!;
    expect(best.concerns).toEqual([]);
    expect(budget.price).toBeLessThan(best.price);
    await expect(bookQuote(plan.id, budget.id, "test")).rejects.toThrow(/reason/);
    await bookQuote(plan.id, best.id, "test");
    for (let i = 0; i < 5; i++) await advanceMission(plan.id, "test");
    await expect(advanceMission(plan.id, "test")).rejects.toThrow(/complete/);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: kase.id } })).status).toBe("RESOLVED");
  });
});

describe("public API and webhooks", () => {
  it("answers with an API key, and refuses a wrong one", async () => {
    process.env.API_KEYS = "test-client:ctk_test_0123456789abcdef";
    const ok = await getCaseV1(new Request("http://localhost/api/v1/cases/CASE-1024", { headers: { authorization: "Bearer ctk_test_0123456789abcdef" } }), { params: { ref: "CASE-1024" } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).case).toMatchObject({ ref: "CASE-1024", patient: { name: "Oliver Bennett" } });
    const bad = await getCaseV1(new Request("http://localhost/api/v1/cases/CASE-1024", { headers: { authorization: "Bearer wrong-key-wrong-key" } }), { params: { ref: "CASE-1024" } });
    expect(bad.status).toBe(401);
    delete process.env.API_KEYS;
  });

  it("posts signed events to a subscribed endpoint", async () => {
    const received: { body: string; signature: string | null }[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ body, signature: (req.headers["x-caretrail-signature"] as string) ?? null });
        res.end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    const endpoint = await createEndpoint({ url: `http://127.0.0.1:${port}/hooks`, events: ["claim.settled"] }, "test");
    await emitEvent("claim.settled", { ref: "CLM-TEST" });
    await emitEvent("case.created", { ref: "CASE-TEST" });
    server.close();
    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0].body)).toMatchObject({ event: "claim.settled", data: { ref: "CLM-TEST" } });
    expect(verifySignature(endpoint.secret, received[0].body, received[0].signature)).toBe(true);
    const deliveries = await prisma.webhookDelivery.findMany({ where: { endpointId: endpoint.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ ok: true, statusCode: 200 });
  });
});

describe("languages", () => {
  it("translates the interface and flips Arabic right to left", () => {
    expect(translate("Provider Search", "es")).toBe("Búsqueda de proveedores");
    expect(translate("Provider Search", "en")).toBe("Provider Search");
    expect(translate("A string nobody translated", "fr")).toBe("A string nobody translated");
    expect(directionOf("ar")).toBe("rtl");
  });

  it("writes the guarantee letter in the hospital's language too", async () => {
    expect(letterLanguageFor("Brazil")).toBe("pt");
    expect(letterLanguageFor("Turkiye")).toBe("tr");
    expect(letterLanguageFor("Egypt")).toBeNull();
    const pdf = await renderGuaranteeLetter({ ref: "LOG-TEST", issuedOn: "2026-10-24", validUntil: "2026-11-23", hospital: { name: "Clínica Demo Bávaro" }, patient: { name: "Sarah Whitfield", dateOfBirth: "1990-06-25", nationality: "United Kingdom" }, policy: { number: "POL-DO-500101", plan: "Plus" }, caseRef: "CASE-1002", treatment: "Wrist fracture", admissionDate: null, guaranteedAmount: 1200, excess: 0, currency: "USD", conditions: ["Itemised invoice"], approvedBy: "test", lang: "es" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
