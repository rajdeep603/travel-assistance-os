import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { MockEmail, setEmailService } from "@/lib/services/email";
import { MockFax, setFaxService } from "@/lib/services/fax";

// Importing a saved e-mail (.eml) or a fax PDF from the sample library runs
// the same intake as the webhooks: OCR, case matching, filing, replies and
// the Letter of Guarantee.

const prisma = new PrismaClient();
const testStart = new Date();
const mail = new MockEmail();
const fax = new MockFax();
const sample = (rel: string) => fs.readFileSync(path.join(process.cwd(), "public", rel));

async function importFile(bytes: Buffer, name: string, type: string) {
  const { POST } = await import("@/app/api/inbox/import/route");
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return POST(new Request("http://app/api/inbox/import", { method: "POST", body: form }), {});
}

async function imported(res: Response) {
  expect(res.status).toBe(201);
  const { message } = await res.json();
  return prisma.inboundMessage.findUniqueOrThrow({
    where: { id: message.id },
    include: { documents: { include: { extraction: true } }, replies: true, matchedCase: true },
  });
}

beforeAll(() => {
  setEmailService(mail);
  setFaxService(fax);
});

afterAll(async () => {
  setEmailService(null);
  setFaxService(null);
  const msgs = await prisma.inboundMessage.findMany({ where: { createdAt: { gte: testStart } } });
  await prisma.guaranteeLetter.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.outboundMessage.deleteMany({ where: { createdAt: { gte: testStart } } });
  const docs = await prisma.document.findMany({ where: { createdAt: { gte: testStart } } });
  await prisma.documentExtraction.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
  await prisma.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
  await prisma.inboundMessage.deleteMany({ where: { id: { in: msgs.map((m) => m.id) } } });
  await prisma.claim.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.caseEvent.deleteMany({ where: { createdAt: { gte: testStart } } });
  await prisma.$disconnect();
});

describe("inbox import", () => {
  it("reads a saved .eml, files its attachment on the quoted claim and replies", async () => {
    const msg = await imported(await importFile(sample("samples/inbox/aylin-yilmaz-missing-policy-number.eml"), "reply.eml", "message/rfc822"));
    expect(msg.channel).toBe("EMAIL");
    expect(msg.fromAddress).toContain("aylin.yilmaz@example.com");
    expect(msg.subject).toBe("Re: Claim CLM-10245 — missing information");
    expect(msg.matchedCase?.ref).toBe("CASE-1020");
    expect(msg.documents.map((d) => [d.filename, d.kind])).toEqual([["discharge-summary-aylin-yilmaz.pdf", "DISCHARGE_SUMMARY"]]);
    expect(msg.status).toBe("REPLIED");
    expect(mail.sent.at(-1)?.to).toContain("aylin.yilmaz@example.com");
  });

  it("reads a renamed fax download with OCR and sends the guarantee back to the hospital", async () => {
    const msg = await imported(
      await importFile(sample("demo-inbound/fax-cost-estimate-oliver-bennett.pdf"), "fax-cost-estimate-oliver-bennett (1).pdf", "application/pdf")
    );
    expect(msg.channel).toBe("FAX");
    expect(msg.fromAddress).toBe("+902120002005");
    expect(msg.matchedCase?.ref).toBe("CASE-1024");
    const [estimate] = msg.documents;
    expect(estimate).toMatchObject({ ocr: true, kind: "COST_ESTIMATE" });
    expect(Number(estimate.extraction?.invoiceAmount)).toBe(6850);
    const letter = await prisma.guaranteeLetter.findFirstOrThrow({ where: { estimateDocumentId: estimate.id } });
    expect(letter.status).toBe("SENT");
    expect(fax.sent.at(-1)?.to).toBe("+902120002005");
  });

  it("refuses files that are neither e-mail nor PDF", async () => {
    const res = await importFile(Buffer.from("just some notes"), "notes.txt", "text/plain");
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/\.eml e-mail or a fax PDF/);
  });
});
