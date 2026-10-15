import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { MockFax, setFaxService } from "@/lib/services/fax";
import { extractTextFromFile } from "@/lib/services/pdf";
import { executeTool } from "@/lib/voice/tools/registry";

const prisma = new PrismaClient();
const testStart = new Date();
const fax = new MockFax();

beforeAll(() => setFaxService(fax));

afterAll(async () => {
  setFaxService(null);
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

describe("Letter of Guarantee from a faxed cost estimate", () => {
  it("reads the fax, decides by the rules, generates the letter and faxes it back", async () => {
    const { POST } = await import("@/app/api/inbox/simulate/route");
    const res = await POST(
      new Request("http://app/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "fax", sample: "fax-cost-estimate" }) }),
      {}
    );
    expect(res.status).toBe(201);
    const { message } = await res.json();
    const msg = await prisma.inboundMessage.findUniqueOrThrow({ where: { id: message.id }, include: { documents: { include: { extraction: true } }, matchedCase: true } });
    expect(msg.matchedCase?.ref).toBe("CASE-1024");
    const estimate = msg.documents[0];
    expect(estimate.ocr).toBe(true);
    expect(estimate.kind).toBe("COST_ESTIMATE");
    expect(Number(estimate.extraction?.invoiceAmount)).toBe(6850);

    const letter = await prisma.guaranteeLetter.findFirstOrThrow({ where: { estimateDocumentId: estimate.id } });
    // Premier plan, within limits and under the automatic limit: approved and sent without a human.
    expect(letter.status).toBe("SENT");
    expect(letter.approvedBy).toBe("system:auto-approval");
    expect(Number(letter.guaranteedAmount)).toBe(6850);
    expect(letter.hospitalName).toBe("Marmara Demo Heart Center");
    expect(letter.sentVia).toBe("FAX");
    expect(fax.sent.at(-1)).toMatchObject({ to: "+902120002005", filename: `letter-of-guarantee-${letter.ref.toLowerCase()}.pdf` });

    // The PDF really is a letter for this patient, with Turkish labels intact.
    const pdfDoc = await prisma.document.findUniqueOrThrow({ where: { id: letter.pdfDocumentId! } });
    const { GET } = await import("@/app/api/documents/[id]/file/route");
    const file = await GET(new Request("http://app/x"), { params: { id: pdfDoc.id } });
    expect(file.headers.get("content-type")).toBe("application/pdf");
    const text = await extractTextFromFile(Buffer.from(await file.arrayBuffer()), "application/pdf");
    expect(text).toContain(letter.ref);
    expect(text).toContain("Oliver Bennett");
    expect(text).toContain("Ödeme Taahhütnamesi");
    expect(text).toContain("6,850.00 EUR");

    const events = await prisma.caseEvent.findMany({ where: { caseId: letter.caseId, type: "LETTER_OF_GUARANTEE", createdAt: { gte: testStart } } });
    expect(events.map((e) => e.title).join(" | ")).toMatch(/drafted.*approved.*sent by fax/s);

    // The confirmation call's tool records the hospital's receipt.
    const result = await executeTool(
      "confirm_log_receipt",
      { letter_ref: letter.ref, received: true, notes: "Angiography scheduled tomorrow 08:00" },
      {
        callId: "x",
        callRef: "CALL-TEST",
        conversationId: "x",
        profileId: "outbound-log-confirmation",
        channel: "PHONE",
        caseId: letter.caseId,
        patientId: null,
        setCase: async () => undefined,
        setOutcome: async () => undefined,
        emit: () => undefined,
        actions: { hangup: async () => undefined, transfer: async () => ({ ok: false, message: "" }) },
      },
      ["confirm_log_receipt"]
    );
    expect(result.saved).toBe(true);
    expect((await prisma.guaranteeLetter.findUniqueOrThrow({ where: { id: letter.id } })).status).toBe("ACKNOWLEDGED");
  });

  it("holds a letter that exceeds the remaining limit for a human, who can approve a lower amount", async () => {
    const { draftFromCostEstimate, approveLetter, sendLetter } = await import("@/lib/services/guarantee-letter");
    // Irina Volkova (Essential, EUR 46,200 of 50,000 used) — an estimate the policy can't fully cover.
    const kase = await prisma.case.findFirstOrThrow({ where: { patient: { ref: "PAT-1008" } } });
    const doc = await prisma.document.create({
      data: {
        filename: "cost-estimate-test.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        kind: "COST_ESTIMATE",
        status: "PROCESSED",
        caseId: kase.id,
        extraction: { create: { invoiceAmount: 9000, currency: "EUR", hospital: "Beyoglu Demo Medical Center", diagnosis: "Gastroenteritis", symptoms: [], procedures: ["IV rehydration"], medications: [], missingInfo: [] } },
      },
    });
    const letter = await draftFromCostEstimate(doc.id, kase.id);
    expect(letter.status).toBe("DRAFT");
    expect(letter.flags).toContain("Estimate exceeds the remaining medical limit");
    expect(Number(letter.guaranteedAmount)).toBe(3700);

    await expect(approveLetter(letter.id, "elif", 12000)).rejects.toThrow(/more than the hospital's estimate/);
    const approved = await approveLetter(letter.id, "elif", 3500);
    expect(approved).toMatchObject({ status: "APPROVED", approvedBy: "elif" });
    expect(Number(approved.guaranteedAmount)).toBe(3500);
    const sent = await sendLetter(letter.id, "elif");
    expect(sent.status).toBe("SENT");
    // Same estimate again: no duplicate letter.
    expect((await draftFromCostEstimate(doc.id, kase.id)).id).toBe(letter.id);
  });
});
