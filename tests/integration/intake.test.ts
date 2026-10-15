import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { MockEmail, setEmailService } from "@/lib/services/email";

// Inbound e-mail and fax automation against the seeded database: OCR,
// translation, case matching, claim filing, risk flags and replies.

const prisma = new PrismaClient();
const testStart = new Date();
const mail = new MockEmail();

async function simulate(kind: "email" | "fax", sample: string) {
  const { POST } = await import("@/app/api/inbox/simulate/route");
  const res = await POST(
    new Request("http://app/api/inbox/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, sample }),
    }),
    {}
  );
  expect(res.status).toBe(201);
  const { message } = await res.json();
  return prisma.inboundMessage.findUniqueOrThrow({
    where: { id: message.id },
    include: { documents: { include: { extraction: true } }, replies: true, matchedCase: true },
  });
}

beforeAll(() => {
  setEmailService(mail);
  process.env.INBOUND_EMAIL_SECRET = "s3cret-path";
});

afterAll(async () => {
  setEmailService(null);
  const msgs = await prisma.inboundMessage.findMany({ where: { createdAt: { gte: testStart } } });
  const docs = await prisma.document.findMany({ where: { inboundMessageId: { in: msgs.map((m) => m.id) } } });
  const newClaims = await prisma.claim.findMany({ where: { createdAt: { gte: testStart } } });
  await prisma.outboundMessage.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.documentExtraction.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
  await prisma.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
  await prisma.inboundMessage.deleteMany({ where: { id: { in: msgs.map((m) => m.id) } } });
  await prisma.claim.deleteMany({ where: { id: { in: newClaims.map((c) => c.id) } } });
  await prisma.caseEvent.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.$disconnect();
});

describe("e-mail intake", () => {
  it("files a claimant's documents on the quoted claim and auto-replies with what's still missing", async () => {
    const msg = await simulate("email", "claim-policy-number");
    expect(msg.matchedCase?.ref).toBe("CASE-1020");
    expect(msg.matchConfidence).toBeGreaterThanOrEqual(0.9);
    expect(msg.riskFlags).toEqual([]);
    expect(msg.status).toBe("REPLIED");
    const claim = await prisma.claim.findUniqueOrThrow({ where: { ref: "CLM-10245" }, include: { documents: true } });
    expect(claim.documents.some((d) => d.inboundMessageId === msg.id)).toBe(true);
    expect(msg.replies).toHaveLength(1);
    expect(msg.replies[0]).toMatchObject({ status: "SENT", automatic: true, channel: "EMAIL" });
    expect(msg.replies[0].body).toContain("CLM-10245");
    expect(msg.replies[0].body).toContain("CASE-1020");
    expect(mail.sent.at(-1)?.to).toContain("aylin.yilmaz@example.com");
    const event = await prisma.caseEvent.findFirst({ where: { caseId: msg.matchedCaseId!, title: { contains: msg.ref } } });
    expect(event?.type).toBe("EMAIL");
  });

  it("opens a new claim from a traveller's e-mailed bills", async () => {
    const msg = await simulate("email", "new-claim-bills");
    expect(msg.matchedCase).toBeTruthy();
    const docs = msg.documents;
    expect(docs.map((d) => d.kind).sort()).toEqual(["HOSPITAL_INVOICE", "MEDICAL_REPORT"]);
    const claimIds = new Set(docs.map((d) => d.claimId));
    expect(claimIds.size).toBe(1);
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: [...claimIds][0]! } });
    expect(claim.caseId).toBe(msg.matchedCaseId);
    expect(claim.status).toBe("NEEDS_REVIEW");
    expect(msg.status).toBe("REPLIED");
  });

  it("reads a Turkish hospital discharge summary and keeps an English translation", async () => {
    const msg = await simulate("email", "hospital-epikriz-tr");
    expect(msg.matchedCase?.ref).toBe("CASE-1022");
    expect(msg.language).toBe("tr");
    const doc = msg.documents[0];
    expect(doc.language).toBe("tr");
    expect(doc.kind).toBe("DISCHARGE_SUMMARY");
    expect(doc.extraction?.patientName).toBe("Lena Koch");
    expect(doc.extraction?.diagnosis).toContain("angina");
    expect(doc.translatedText).toContain("Unstable angina pectoris");
    // Hospital correspondence: no auto-reply to the hospital.
    expect(msg.replies).toHaveLength(0);
    expect(msg.status).toBe("MATCHED");
  });

  it("holds complaints for a human with a drafted reply instead of answering automatically", async () => {
    const sentBefore = mail.sent.length;
    const msg = await simulate("email", "complaint");
    expect(msg.riskFlags).toContain("Complaint or legal threat");
    expect(msg.status).toBe("NEEDS_REVIEW");
    expect(mail.sent.length).toBe(sentBefore);
    expect(msg.replies).toHaveLength(1);
    expect(msg.replies[0]).toMatchObject({ status: "QUEUED", automatic: false });
  });

  it("accepts SendGrid Inbound Parse posts only on the secret path", async () => {
    const { POST } = await import("@/app/api/inbound/email/[secret]/route");
    const form = new FormData();
    form.append("from", "Unknown Sender <someone@example.org>");
    form.append("subject", "Hello");
    form.append("text", "Just saying hello.");
    form.append("headers", "Message-ID: <test-123@example.org>\nSubject: Hello");
    const wrong = await POST(new Request("http://app/x", { method: "POST", body: form }), { params: { secret: "nope" } });
    expect(wrong.status).toBe(404);
    const ok = await POST(new Request("http://app/x", { method: "POST", body: form }), { params: { secret: "s3cret-path" } });
    expect(ok.status).toBe(200);
    // Redelivery of the same Message-ID is ignored.
    const again = await POST(new Request("http://app/x", { method: "POST", body: form }), { params: { secret: "s3cret-path" } });
    expect((await again.json()).received).toBe((await ok.json()).received);
    expect(await prisma.inboundMessage.count({ where: { externalId: "<test-123@example.org>" } })).toBe(1);
  });
});

describe("fax intake", () => {
  it("OCRs a handwritten fax with no text layer and files it on the patient's case", async () => {
    const pdf = fs.readFileSync(path.join(process.cwd(), "public/demo-inbound/fax-medical-report-lena-koch.pdf"));
    const { extractTextFromFile } = await import("@/lib/services/pdf");
    const { hasReadableText } = await import("@/lib/services/document-extraction");
    expect(hasReadableText(await extractTextFromFile(pdf, "application/pdf"))).toBe(false);

    const msg = await simulate("fax", "fax-medical-report");
    const doc = msg.documents[0];
    expect(doc.ocr).toBe(true);
    expect(doc.source).toBe("FAX");
    expect(doc.extraction?.patientName).toBe("Lena Koch");
    expect(doc.extraction?.policyReference).toBe("POL-TR-100946");
    expect(msg.matchedCase?.ref).toBe("CASE-1022");
    expect(msg.status).toBe("MATCHED");
  });
});
