import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allSampleFiles, SAMPLE_KITS } from "@/lib/samples/catalog";
import { INTAKE_REQUESTS } from "@/lib/samples/intake-requests";
import { EMAIL_SAMPLES, sampleScanText } from "@/lib/intake/samples";
import { looksLikeEml, parseEml } from "@/lib/intake/eml";
import { extractTextFromFile } from "@/lib/services/pdf";
import { MockAIService } from "@/lib/services/ai/mock";
import { crc32, zip } from "@/lib/zip";

// The downloadable sample library must stay readable by the offline model:
// these are the files a presenter uploads at the booth with no AI key.

const PUBLIC = path.join(process.cwd(), "public");
const read = (rel: string) => fs.readFileSync(path.join(PUBLIC, rel));
const ai = new MockAIService();

async function readPdf(rel: string) {
  const buffer = read(rel);
  let text = await extractTextFromFile(buffer, "application/pdf");
  const scanned = text.replace(/-- \d+ of \d+ --/g, "").replace(/[^a-z]/gi, "").length < 20;
  if (scanned) text = (await ai.readDocument({ buffer, mimeType: "application/pdf", filename: path.basename(rel) })).text;
  const kind = await ai.classifyDocument(text, path.basename(rel));
  const { extraction } = await ai.extractMedicalDocument(text);
  return { kind, scanned, e: extraction };
}

describe("sample library", () => {
  it("has every listed file on disk", () => {
    const missing = allSampleFiles().filter((f) => !fs.existsSync(path.join(PUBLIC, f.path)));
    expect(missing.map((f) => f.path)).toEqual([]);
    expect(new Set(SAMPLE_KITS.map((k) => k.id)).size).toBe(SAMPLE_KITS.length);
  });

  const expected: Record<string, { kind: string; patient: string; policy?: string; amount?: [number, string]; scanned?: boolean }> = {
    "demo-documents/medical-report-aylin-yilmaz.pdf": { kind: "MEDICAL_REPORT", patient: "Aylin Yilmaz" },
    "demo-documents/hospital-invoice-aylin-yilmaz.pdf": { kind: "HOSPITAL_INVOICE", patient: "Aylin Yilmaz", amount: [25250, "TRY"] },
    "demo-documents/discharge-summary-aylin-yilmaz.pdf": { kind: "DISCHARGE_SUMMARY", patient: "Aylin Yilmaz" },
    "demo-documents/prescription-aylin-yilmaz.pdf": { kind: "PRESCRIPTION", patient: "Aylin Yilmaz", policy: "POL-TR-100944" },
    "demo-documents/medical-report-james-carter.pdf": { kind: "MEDICAL_REPORT", patient: "James Carter" },
    "demo-documents/hospital-invoice-james-carter.pdf": { kind: "HOSPITAL_INVOICE", patient: "James Carter", amount: [800, "EUR"] },
    "demo-documents/emergency-report-lena-koch.pdf": { kind: "MEDICAL_REPORT", patient: "Lena Koch", policy: "POL-TR-100946" },
    "demo-documents/discharge-summary-lena-koch.pdf": { kind: "DISCHARGE_SUMMARY", patient: "Lena Koch", policy: "POL-TR-100946" },
    "demo-documents/hospital-invoice-lena-koch.pdf": { kind: "HOSPITAL_INVOICE", patient: "Lena Koch", policy: "POL-TR-100946", amount: [4060, "EUR"] },
    "demo-documents/cost-estimate-carlos-garcia.pdf": { kind: "COST_ESTIMATE", patient: "Carlos Garcia", policy: "POL-TR-100952", amount: [4200, "EUR"] },
    "demo-inbound/cost-estimate-oliver-bennett.pdf": { kind: "COST_ESTIMATE", patient: "Oliver Bennett", policy: "POL-TR-100950", amount: [6850, "EUR"] },
    "demo-inbound/epikriz-lena-koch.pdf": { kind: "DISCHARGE_SUMMARY", patient: "Lena Koch", policy: "POL-TR-100946" },
    "demo-inbound/fax-cost-estimate-oliver-bennett.pdf": { kind: "COST_ESTIMATE", patient: "Oliver Bennett", policy: "POL-TR-100950", amount: [6850, "EUR"], scanned: true },
    "demo-inbound/fax-medical-report-lena-koch.pdf": { kind: "DISCHARGE_SUMMARY", patient: "Lena Koch", policy: "POL-TR-100946", scanned: true },
  };

  it("covers every PDF in the library", () => {
    const pdfs = allSampleFiles().map((f) => f.path).filter((p) => p.endsWith(".pdf"));
    expect(pdfs.filter((p) => !expected[p])).toEqual([]);
  });

  for (const [rel, want] of Object.entries(expected)) {
    it(`reads ${path.basename(rel)} offline`, async () => {
      const { kind, scanned, e } = await readPdf(rel);
      expect(kind).toBe(want.kind);
      expect(scanned).toBe(!!want.scanned);
      expect(e.patientName).toBe(want.patient);
      expect(e.dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (want.policy) expect(e.policyReference).toBe(want.policy);
      if (want.amount) expect([e.invoiceAmount, e.currency]).toEqual(want.amount);
      // A field value never runs into the next field on its line.
      for (const v of [e.patientName, e.hospital, e.doctor, e.diagnosis, e.admissionDate]) expect(v ?? "").not.toMatch(/:/);
    });
  }

  it("reads a renamed copy of a fax scan", () => {
    const buffer = read("demo-inbound/fax-cost-estimate-oliver-bennett.pdf");
    expect(sampleScanText("scan_0042.pdf", buffer)).toContain("Estimated Total: 6,850.00 EUR");
    expect(sampleScanText("fax-cost-estimate-oliver-bennett (1).pdf")).toContain("Oliver Bennett");
    expect(sampleScanText("something-else.pdf", Buffer.from("%PDF-1.3"))).toBeNull();
  });
});

describe("sample e-mails", () => {
  const emails = allSampleFiles().filter((f) => f.email);

  it("include one .eml per inbox sample", () => {
    expect(emails.map((f) => f.email!.sample).sort()).toEqual(EMAIL_SAMPLES.map((e) => e.id).sort());
  });

  for (const f of emails) {
    it(`parses ${path.basename(f.path)} with its attachments`, async () => {
      const buffer = read(f.path);
      const source = EMAIL_SAMPLES.find((e) => e.id === f.email!.sample)!;
      expect(looksLikeEml(buffer, "renamed.txt")).toBe(true);
      const input = await parseEml(buffer);
      expect(input.channel).toBe("EMAIL");
      expect(input.from).toBe(source.from);
      expect(input.subject).toBe(source.subject);
      expect(input.body).toBe(source.body);
      expect(input.files.map((a) => a.filename)).toEqual(source.attachments.map((a) => path.basename(a)));
      // Same document as the published PDF (by its text: CI may redraw the stamps).
      for (const a of input.files) {
        const published = read(source.attachments.find((p) => p.endsWith(a.filename))!);
        expect(await extractTextFromFile(a.buffer, "application/pdf")).toBe(await extractTextFromFile(published, "application/pdf"));
      }
    });
  }

  it("does not mistake a PDF or plain text for an e-mail", () => {
    expect(looksLikeEml(Buffer.from("%PDF-1.7\n"), "x.pdf")).toBe(false);
    expect(looksLikeEml(Buffer.from("My husband has stomach pain."), "note.txt")).toBe(false);
  });
});

describe("sample assistance requests", () => {
  const want: Record<string, { patient: string; location: string; urgency: string; type: string; caseRef?: string }> = {
    "call-note-taksim-stomach-pain.txt": { patient: "Traveller's husband", location: "Taksim, Istanbul", urgency: "HIGH", type: "MEDICAL" },
    "whatsapp-kadikoy-child-fever.txt": { patient: "Emma Van Dijk", location: "Kadikoy, Istanbul", urgency: "MEDIUM", type: "MEDICAL" },
    "email-hotel-sultanahmet-toothache.txt": { patient: "Marco Bianchi", location: "Sultanahmet, Istanbul", urgency: "HIGH", type: "DENTAL" },
    "email-tour-operator-case-1013.txt": { patient: "Oliver Bennett", location: "Besiktas, Istanbul", urgency: "MEDIUM", type: "MEDICAL", caseRef: "CASE-1013" },
    "call-transcript-sisli-chest-pain.txt": { patient: "Thomas Weber", location: "Sisli, Istanbul", urgency: "CRITICAL", type: "MEDICAL" },
  };

  it("are all in the library and on disk, as written", () => {
    expect(INTAKE_REQUESTS.map((r) => r.file).sort()).toEqual(Object.keys(want).sort());
    for (const r of INTAKE_REQUESTS) expect(read(`samples/intake/${r.file}`).toString("utf8")).toBe(r.text);
  });

  for (const r of INTAKE_REQUESTS) {
    it(`analyses ${r.file} offline`, async () => {
      const a = await ai.analyzeAssistanceRequest(r.text);
      const w = want[r.file];
      expect({ patient: a.patient, location: a.location, urgency: a.urgency, type: a.assistanceType, caseRef: a.existingCaseRef ?? undefined }).toEqual({
        ...w,
        caseRef: w.caseRef,
      });
    });
  }
});

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(Buffer.from("hello"))).toBe(0x3610a686);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes stored entries with a central directory", () => {
    const out = zip([
      { name: "a.txt", data: Buffer.from("hello") },
      { name: "ö.txt", data: Buffer.from("world!") },
    ]);
    expect(out.readUInt32LE(0)).toBe(0x04034b50);
    const end = out.length - 22;
    expect(out.readUInt32LE(end)).toBe(0x06054b50);
    expect(out.readUInt16LE(end + 10)).toBe(2);
    const dirOffset = out.readUInt32LE(end + 16);
    expect(out.readUInt32LE(dirOffset)).toBe(0x02014b50);
    // First entry: header, name, then the bytes as stored.
    expect(out.subarray(30, 35).toString()).toBe("a.txt");
    expect(out.subarray(35, 40).toString()).toBe("hello");
    expect(out.readUInt32LE(14)).toBe(0x3610a686);
  });
});
