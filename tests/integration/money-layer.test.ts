import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { MockEmail, setEmailService } from "@/lib/services/email";
import { MockFax, setFaxService } from "@/lib/services/fax";
import { reviewResult } from "@/lib/services/bill-review-service";

// The money layer against the seeded database: bill review of a hospital's
// direct-billed invoice against its guarantee, the person's decision, open
// guarantees counted against the policy limit, and approvals above it.

const prisma = new PrismaClient();
const testStart = new Date();
const mail = new MockEmail();
const fax = new MockFax();
let carlosUsed: number | null = null;

beforeAll(() => {
  setEmailService(mail);
  setFaxService(fax);
});

afterAll(async () => {
  setEmailService(null);
  setFaxService(null);
  if (carlosUsed != null) await prisma.policy.update({ where: { number: "POL-TR-100952" }, data: { medicalUsed: carlosUsed } });
  // LOG-0904 is a seeded draft: put it back the way the seed left it.
  const log904 = await prisma.guaranteeLetter.findUnique({ where: { ref: "LOG-0904" } });
  if (log904 && log904.updatedAt >= testStart) {
    const trace = { ...(log904.decisionTrace as Record<string, unknown>) };
    delete trace.override;
    await prisma.guaranteeLetter.update({
      where: { id: log904.id },
      data: { status: "DRAFT", approvedBy: null, pdfDocumentId: null, guaranteedAmount: 11350, decisionTrace: trace as object },
    });
  }
  const msgs = await prisma.inboundMessage.findMany({ where: { createdAt: { gte: testStart } } });
  await prisma.guaranteeLetter.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.outboundMessage.deleteMany({ where: { createdAt: { gte: testStart } } });
  const docs = await prisma.document.findMany({ where: { createdAt: { gte: testStart } } });
  await prisma.documentExtraction.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
  await prisma.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
  await prisma.inboundMessage.deleteMany({ where: { id: { in: msgs.map((m) => m.id) } } });
  await prisma.caseEvent.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.$disconnect();
});

describe("bill review on direct billing", () => {
  let reviewId = "";

  it("reviews the hospital's final invoice line by line against the guarantee", async () => {
    const { POST } = await import("@/app/api/inbox/simulate/route");
    const res = await POST(
      new Request("http://app/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "email", sample: "hospital-final-invoice" }) }),
      {}
    );
    expect(res.status).toBe(201);
    const { message } = await res.json();
    const msg = await prisma.inboundMessage.findUniqueOrThrow({ where: { id: message.id }, include: { matchedCase: true, documents: { include: { billReview: true, extraction: true } } } });
    expect(msg.matchedCase?.ref).toBe("CASE-1022");
    // From the hospital, not the traveller: no claim is opened, and nothing about the review reaches a claimant.
    const [invoice] = msg.documents;
    expect(invoice).toMatchObject({ kind: "HOSPITAL_INVOICE", claimId: null });
    expect(invoice.extraction?.documentNumber).toBe("MHC-INV-2026-1342");
    const review = invoice.billReview!;
    reviewId = review.id;
    expect([Number(review.billed), Number(review.recommended), Number(review.savings)]).toEqual([12385, 7582.5, 4802.5]);
    expect(review.status).toBe("PROPOSED");
    const result = reviewResult(review);
    expect(result.guarantee).toEqual({ ref: "LOG-0902", amount: 11850, currency: "EUR", exceedsBy: 535, recommendedExceedsBy: 0 });
    expect(msg.summary).toMatch(/Bill review found 4,802\.50 EUR above the reference tariff/);
    const event = await prisma.caseEvent.findFirst({ where: { caseId: msg.matchedCaseId!, type: "BILL_REVIEW", createdAt: { gte: testStart } } });
    expect(event?.title).toBe("Bill review: 4,802.50 EUR above the reference tariff on MHC-INV-2026-1342");
    expect(event?.body).toMatch(/Exceeds LOG-0902 by 535\.00 EUR; within the guarantee after review\./);
  });

  it("records a person's decision once, on the case timeline", async () => {
    const { POST } = await import("@/app/api/bill-reviews/[id]/route");
    const call = (decision: string) =>
      POST(new Request("http://app/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) }), {
        params: { id: reviewId },
      });
    const ok = await call("ACCEPTED");
    expect(ok.status).toBe(200);
    expect((await ok.json()).review).toMatchObject({ status: "ACCEPTED", decidedBy: expect.any(String) });
    expect((await call("WAIVED")).status).toBe(409);
    const event = await prisma.caseEvent.findFirst({ where: { type: "BILL_REVIEW", title: { startsWith: "Bill review accepted" }, createdAt: { gte: testStart } } });
    expect(event?.title).toBe("Bill review accepted on MHC-INV-2026-1342: pay 7,582.50 EUR, saving 4,802.50 EUR");
  });

  it("keeps the decision when the same invoice is reviewed again", async () => {
    const { reviewBillForDocument } = await import("@/lib/services/bill-review-service");
    const review = await prisma.billReview.findUniqueOrThrow({ where: { id: reviewId } });
    const again = await reviewBillForDocument(review.documentId);
    expect(again?.status).toBe("ACCEPTED");
  });
});

describe("guarantees against the policy limit", () => {
  it("counts open guarantees before issuing another one", async () => {
    // Lena: Essential, EUR 50,000 limit, 1,850 used, LOG-0902 (11,850) open → 36,300 left.
    const kase = await prisma.case.findUniqueOrThrow({ where: { ref: "CASE-1022" } });
    const doc = await prisma.document.create({
      data: {
        filename: "cost-estimate-second-admission.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        kind: "COST_ESTIMATE",
        status: "PROCESSED",
        caseId: kase.id,
        patientId: kase.patientId,
        extraction: { create: { hospital: "Marmara Demo Heart Center", diagnosis: "Unstable angina", invoiceAmount: 40000, currency: "EUR", procedures: ["Coronary bypass"] } },
      },
    });
    const { draftFromCostEstimate } = await import("@/lib/services/guarantee-letter");
    const letter = await draftFromCostEstimate(doc.id, kase.id);
    expect(Number(letter.guaranteedAmount)).toBe(36200); // 36,300 left − 100 excess
    expect(letter.flags).toContain("Estimate exceeds the remaining medical limit");
    expect(letter.status).toBe("DRAFT");
    const computation = (letter.decisionTrace as { computation: Record<string, number> }).computation;
    expect(computation).toMatchObject({ remainingMedicalLimitEur: 36300, committedGuaranteesEur: 11850 });
    const { describeGuaranteeDecision } = await import("@/lib/guarantee-trace");
    expect(describeGuaranteeDecision(letter.decisionTrace, letter.flags).join(" ")).toMatch(/after €11,850 already committed in open guarantees/);
  });

  it("asks for a reason to approve above what the policy can still guarantee", async () => {
    // Carlos: Plus, EUR 250,000. Use up all but 5,000, then try to approve LOG-0904 (11,350).
    const policy = await prisma.policy.findUniqueOrThrow({ where: { number: "POL-TR-100952" } });
    carlosUsed = Number(policy.medicalUsed);
    await prisma.policy.update({ where: { id: policy.id }, data: { medicalUsed: 245000 } });
    const letter = await prisma.guaranteeLetter.findUniqueOrThrow({ where: { ref: "LOG-0904" } });
    const { POST } = await import("@/app/api/guarantee-letters/[id]/approve/route");
    const approve = (body: object) =>
      POST(new Request("http://app/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), {
        params: { id: letter.id },
      });

    const refused = await approve({});
    expect(refused.status).toBe(422);
    const err = (await refused.json()).error;
    expect(err.code).toBe("REASON_REQUIRED");
    expect(err.message).toMatch(/above what the policy can still guarantee \(5,000 EUR\)/);

    const ok = await approve({ reason: "Senior desk approved a top-up after the surgeon's call" });
    expect(ok.status).toBe(200);
    const approved = await prisma.guaranteeLetter.findUniqueOrThrow({ where: { id: letter.id } });
    expect(approved.status).toBe("APPROVED");
    expect((approved.decisionTrace as { override?: { reason: string; remaining: number } }).override).toMatchObject({
      reason: "Senior desk approved a top-up after the surgeon's call",
      remaining: 5000,
    });
    const event = await prisma.caseEvent.findFirst({ where: { caseId: approved.caseId, title: { startsWith: "LOG-0904 approved" }, createdAt: { gte: testStart } } });
    expect(event?.body).toMatch(/Reason: Senior desk approved a top-up/);
  });
});
