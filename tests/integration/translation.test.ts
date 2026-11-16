import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { MockEmail, setEmailService } from "@/lib/services/email";

// Documents and messages in other languages: an Arabic scan from Jeddah and a
// French report from Paris (Benefit demo) arrive by e-mail, are read, put
// into English and filed on the member's case; the translation comes out as
// a PDF; and a partner demo portal's inbox, Document AI and claim runs only
// ever see, and replace, their own records.

const prisma = new PrismaClient();
const testStart = new Date();
const mail = new MockEmail();
let portalId = "";

beforeAll(async () => {
  setEmailService(mail);
  const { ensureBenefitRecords } = await import("@/lib/partner-demo/benefit-records");
  await ensureBenefitRecords();
  const portal = await prisma.demoPortal.create({
    data: {
      token: `test-${Date.now()}`,
      kit: "benefit",
      company: "Benefit Global Assistance",
      contactName: "Test",
      contactEmail: "qa@sthiram.test",
      emailDomain: "sthiram.test",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  portalId = portal.id;
});

afterAll(async () => {
  setEmailService(null);
  const { deleteInboundMessage, deleteDocument } = await import("@/lib/services/erase");
  for (const m of await prisma.inboundMessage.findMany({ where: { createdAt: { gte: testStart } }, select: { id: true } })) {
    await deleteInboundMessage(m.id, { replacingSample: true }).catch(() => undefined);
  }
  for (const d of await prisma.document.findMany({ where: { createdAt: { gte: testStart } }, select: { id: true } })) {
    await deleteDocument(d.id).catch(() => undefined);
  }
  const claims = await prisma.claim.findMany({ where: { createdAt: { gte: testStart } }, select: { id: true } });
  await prisma.billReview.deleteMany({ where: { claimId: { in: claims.map((c) => c.id) } } });
  await prisma.claim.deleteMany({ where: { id: { in: claims.map((c) => c.id) } } });
  await prisma.outboundMessage.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.caseEvent.deleteMany({ where: { createdAt: { gte: testStart }, actor: "agent:intake" } });
  await prisma.demoPortal.deleteMany({ where: { id: portalId } });
  await prisma.$disconnect();
});

async function receive(kind: "email" | "whatsapp", sample: string) {
  const { receiveSample } = await import("@/lib/intake/simulate");
  const message = await receiveSample(kind, sample);
  return prisma.inboundMessage.findUniqueOrThrow({
    where: { id: message.id },
    include: { documents: { include: { extraction: true } }, matchedCase: { include: { patient: true } } },
  });
}

describe("documents in other languages", () => {
  it("reads the Arabic scan from Jeddah, puts the e-mail and the report into English and files them on Hasan Kılıç's case", async () => {
    const msg = await receive("email", "benefit-arabic-report-jeddah");
    expect(msg.language).toBe("ar");
    expect(msg.translatedText).toContain("Please find attached the medical report for the patient Hasan Kılıç");
    expect(msg.matchedCase?.patient.policyNumber).toBe("BGA-207733");
    expect(msg.status).toBe("MATCHED");
    // The Arabic sender's name stays out of the English summary.
    expect(msg.summary).toMatch(/^E-mail from international@demo-alshati\.example about CASE-/);

    const [doc] = msg.documents;
    expect(doc.ocr).toBe(true);
    expect(doc.language).toBe("ar");
    expect(doc.textContent).toContain("تقرير طبي");
    expect(doc.translatedText).toContain("Community-acquired pneumonia of the right lower lobe");
    expect(doc.caseId).toBe(msg.matchedCaseId);
    expect(doc.extraction?.patientName).toBe("Hasan Kılıç");
    expect(doc.extraction?.policyReference).toBe("BGA-207733");
    expect(doc.extraction?.procedures).toContain("intravenous fluids");
  });

  it("puts the Paris clinic's French e-mail and report into English and files them on Elif Şahin's case", async () => {
    const msg = await receive("email", "benefit-french-report-paris");
    expect(msg.language).toBe("fr");
    expect(msg.translatedText).toContain("Please confirm that you will cover the hospital costs");
    expect(msg.matchedCase?.patient.policyNumber).toBe("BGA-318264");
    const [doc] = msg.documents;
    expect(doc.language).toBe("fr");
    expect(doc.ocr).toBe(false);
    expect(doc.translatedText).toContain("Laparoscopic appendectomy on 10 November");
    expect(doc.extraction?.diagnosis).toBe("Acute uncomplicated appendicitis");
    expect(doc.extraction?.dischargeDate).toBe("2026-11-12");
  });

  it("translates a traveller's Spanish WhatsApp message for the team", async () => {
    const msg = await receive("whatsapp", "wa-traveller-status-es");
    expect(msg.language).toBe("es");
    expect(msg.translatedText).toContain("Can you tell me where my case stands");
  });

  it("leaves an English message untranslated", async () => {
    const { receiveSample } = await import("@/lib/intake/simulate");
    const message = await receiveSample("email", "hospital-final-invoice");
    expect(message.translatedText).toBeNull();
  });

  it("renders a document's English translation as a PDF", async () => {
    const doc = await prisma.document.findFirstOrThrow({ where: { createdAt: { gte: testStart }, language: "ar", translatedText: { not: null } } });
    const { GET } = await import("@/app/api/documents/[id]/translation/route");
    const res = await GET(new Request(`http://app/api/documents/${doc.id}/translation`), { params: { id: doc.id } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("medical-report-ar-hasan-kilic-jeddah-english.pdf");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("partner demo portal modules", () => {
  it("reads a sample with Document AI, and a second run replaces the portal's first copy", async () => {
    const { runDocumentSample, portalOwnsDocument } = await import("@/lib/partner-demo/modules");
    const { logPortalEvent } = await import("@/lib/partner-demo/portal");
    const portal = { id: portalId, kit: "benefit" };
    const file = "demo-documents/compte-rendu-elif-sahin-paris.pdf";

    const first = await runDocumentSample(portal, file);
    await logPortalEvent(portalId, "DOC_RUN", "qa@sthiram.test", { sample: file, documentId: first.id });
    expect(first.language).toBe("fr");
    expect(first.english).toContain("Acute uncomplicated appendicitis");
    // A report has no amount to look for.
    expect(first.read?.missingInfo.some((x) => /invoice amount/i.test(x))).toBe(false);
    expect(await portalOwnsDocument(portalId, { id: first.id, inboundMessageId: null, claimId: null })).toBe(true);

    const second = await runDocumentSample(portal, file);
    expect(await prisma.document.findUnique({ where: { id: first.id } })).toBeNull();
    expect(second.id).not.toBe(first.id);
    // Another portal's document, or any other, is not this portal's.
    const other = await prisma.document.findFirstOrThrow({ where: { id: { not: second.id } } });
    expect(await portalOwnsDocument(portalId, other)).toBe(false);
  });

  it("refuses a file that isn't one of the kit's samples", async () => {
    const { runDocumentSample } = await import("@/lib/partner-demo/modules");
    await expect(runDocumentSample({ id: portalId, kit: "benefit" }, "../../.env")).rejects.toThrow(/Unknown sample/);
  });

  it("opens a claim from the sample pack with a recommended settlement, and the next run replaces it", async () => {
    const { runClaim: run } = await import("@/lib/partner-demo/modules");
    const { withOfflineAI } = await import("@/lib/services/ai");
    const { logPortalEvent } = await import("@/lib/partner-demo/portal");
    // The claim's summary would go to the live model when a key is configured; tests stay offline.
    const runClaim = (id: string) => withOfflineAI(() => run(id));
    const first = await runClaim(portalId);
    await logPortalEvent(portalId, "CLAIM_RUN", "qa@sthiram.test", { claimId: first.claimId });
    expect(first.view.status).toBe("NEEDS_REVIEW");
    expect(first.view.documents).toHaveLength(3);
    expect(first.view.settlement?.billed).toBe(25250);
    expect(first.view.settlement?.currency).toBe("TRY");
    expect(first.view.summary ?? "").not.toContain("**");

    const second = await runClaim(portalId);
    expect(await prisma.claim.findUnique({ where: { id: first.claimId } })).toBeNull();
    expect(await prisma.document.count({ where: { claimId: first.claimId } })).toBe(0);
    expect(second.claimId).not.toBe(first.claimId);
  });
});
