import type { DocumentKind } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Output contracts for the live AI provider. They double as structured-output
// formats (the model is constrained to them) and as validators: a response
// that doesn't fit is treated like a failed call, so the resilient wrapper
// falls back to the deterministic provider instead of storing bad data.
// ---------------------------------------------------------------------------

export const DOCUMENT_KINDS = [
  "MEDICAL_REPORT",
  "HOSPITAL_INVOICE",
  "PRESCRIPTION",
  "DISCHARGE_SUMMARY",
  "COST_ESTIMATE",
  "CORRESPONDENCE",
  "OTHER",
] as const satisfies readonly DocumentKind[];

const text = () => z.string().nullable();

export const MedicalExtractionResultSchema = z.object({
  extraction: z.object({
    patientName: text(),
    dateOfBirth: text().describe("YYYY-MM-DD when known"),
    hospital: text(),
    doctor: text(),
    diagnosis: text(),
    symptoms: z.array(z.string()),
    admissionDate: text().describe("YYYY-MM-DD when known"),
    dischargeDate: text().describe("YYYY-MM-DD when known"),
    procedures: z.array(z.string()),
    medications: z.array(z.string()),
    invoiceAmount: z.number().nullable().describe("Total amount as a plain number, no separators"),
    currency: text().describe("ISO 4217 code, e.g. EUR, TRY, USD"),
    policyReference: text(),
  }),
  documentNumber: text().describe("Invoice, estimate or fatura number, if the document has one"),
  lineItems: z
    .array(
      z.object({
        code: text().describe("Tariff or service code printed on the row"),
        description: z.string(),
        quantity: z.number().nullable(),
        unitPrice: z.number().nullable().describe("Plain number, no separators"),
        amount: z.number().nullable().describe("Plain number, no separators"),
      })
    )
    .describe("One entry per charge row of an invoice or cost estimate, never subtotal, VAT or total rows; [] for other documents"),
  summary: z.string(),
  missingInfo: z.array(z.string()),
  confidence: z.number().describe("0 to 1"),
});

export const CaseIntakeAnalysisSchema = z.object({
  patient: text(),
  location: text(),
  country: text(),
  medicalIssue: text(),
  symptoms: z.array(z.string()),
  assistanceType: z.enum([
    "MEDICAL",
    "DENTAL",
    "HOSPITALIZATION",
    "EVACUATION",
    "REPATRIATION",
    "GENERAL",
  ]),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  requestedAction: text(),
  existingCaseRef: text().describe("A CASE-#### reference mentioned in the request, else null"),
  summary: z.string(),
  suggestedActions: z.array(z.string()),
});

export const ClassificationSchema = z.object({ kind: z.enum(DOCUMENT_KINDS) });

export const ReadDocumentSchema = z.object({
  text: z.string().describe("Full transcription, line by line, as written"),
  language: z.string().nullable().describe("ISO 639-1 code of the main language"),
});

export const BusinessCardSchema = z.object({
  name: text().describe("The person's full name, as printed"),
  company: text().describe("Their company or organisation"),
  jobTitle: text().describe("Their job title or role"),
  email: text(),
  phone: text().describe("The mobile number if there are several, else the first; with the country code if printed"),
  website: text(),
});
