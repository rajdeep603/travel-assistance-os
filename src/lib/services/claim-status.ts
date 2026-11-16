import type { ClaimStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { nextRef } from "@/lib/refs";
import { BENEFIT_PLANS } from "@/lib/partner-demo/benefit-records";
import type { Settlement } from "./settlement";

// ---------------------------------------------------------------------------
// The claim status line: members, healthcare providers and brokers call to
// ask where a claim stands. Each claim is described three times, once for
// each kind of caller, so the agent only ever says what that caller may
// hear: the member gets everything about their own claim, the provider what
// concerns its invoice and payment, the broker the status without medical
// details. A client's own system sends the same shape in an API brief
// (`_cases`, as the Global Excel POC does); without one, the line reads
// CareTrail's own claims.
// ---------------------------------------------------------------------------

export interface StatusView {
  status: string;
  next_step: string;
  [key: string]: unknown;
}

export interface ClaimStatusFacts {
  ref: string;
  /** The insured person's full name. */
  member: string;
  /** YYYY-MM-DD; checked, never said. */
  dob: string | null;
  policy_number?: string | null;
  member_language?: string | null;
  insurer?: string | null;
  /** The treating hospital or clinic ("Istanbul Central Demo Hospital, Istanbul"). */
  provider?: string | null;
  broker?: { name: string; code: string } | null;
  /** Member and provider only. */
  treatment?: string | null;
  dates?: string | null;
  amount?: string | null;
  documents_received?: string[];
  documents_missing?: string[];
  case_manager?: string | null;
  for_member: StatusView;
  for_provider: StatusView;
  for_broker: StatusView;
}

// ---- Demo records -----------------------------------------------------------

const ANATOLIA = { name: "Anatolia Insurance Brokers (demo)", code: "AIB-3108", email: "claims@anatolia-brokers-demo.example" };
const LAKESHORE = { name: "Lakeshore Benefits Brokers (demo)", code: "LBB-2210", email: "claims@lakeshore-brokers-demo.example" };
export const MITRA = { name: "PT Mitra Proteksi Indonesia (demo)", code: "MPI-0417", email: "klaim@mitraproteksi-demo.example" };

/** Which broker placed which demo policy (filled in where a policy has none). */
const DEMO_BROKERS: Record<string, typeof ANATOLIA> = {
  "POL-TR-100944": ANATOLIA,
  "POL-TR-100945": ANATOLIA,
  "POL-CA-400101": LAKESHORE,
};

/** An Indonesian member whose broker in Jakarta asks about the claim in Bahasa Indonesia. */
export const BUDI = {
  firstName: "Budi",
  lastName: "Santoso",
  dateOfBirth: "1981-02-14",
  nationality: "Indonesia",
  language: "Indonesian",
  phone: "+62 812 0000 4417",
  email: "budi.santoso@example.com",
  policyNumber: "POL-ID-500417",
};

const BUDI_CASE = {
  title: "Acute gastroenteritis with dehydration — Istanbul",
  description: "Indonesian traveller on a tour of Istanbul, admitted overnight with vomiting and dehydration; discharged the next day.",
  location: "Sultanahmet, Istanbul",
  aiSummary: "Indonesian traveller, 45, admitted for one night at Istanbul Central Demo Hospital with acute gastroenteritis and dehydration; IV fluids, discharged well. The hospital bills the plan directly; the itemised invoice is still awaited.",
};

const BUDI_CLAIM = {
  providerName: "Istanbul Central Demo Hospital",
  amount: 42600,
  currency: "TRY",
  summary: "One night's admission for acute gastroenteritis with dehydration. Medical report received; the hospital's itemised invoice is still missing.",
  issues: [
    { severity: "ok", message: "Medical report received" },
    { severity: "error", message: "Itemised hospital invoice missing" },
  ],
};

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Creates whatever of the claim status line's demo records is missing (by natural keys; refs from the usual sequences). */
export async function ensureClaimStatusRecords(): Promise<void> {
  for (const [number, broker] of Object.entries(DEMO_BROKERS)) {
    await prisma.policy.updateMany({ where: { number, brokerCode: null }, data: { brokerName: broker.name, brokerCode: broker.code, brokerEmail: broker.email } });
  }
  const existing = await prisma.patient.findUnique({ where: { policyNumber: BUDI.policyNumber }, select: { id: true } });
  const patient =
    existing ??
    (await prisma.patient.create({
      data: { ref: await nextRef("patient"), ...BUDI, dateOfBirth: new Date(BUDI.dateOfBirth) },
      select: { id: true },
    }));
  const plan = BENEFIT_PLANS.Plus;
  await prisma.policy.upsert({
    where: { number: BUDI.policyNumber },
    create: {
      number: BUDI.policyNumber,
      plan: "Plus",
      validFrom: new Date("2026-06-01T00:00:00Z"),
      validTo: new Date(Math.max(Date.parse("2027-10-31T23:59:59Z"), Date.now() + 300 * 86_400_000)),
      currency: "EUR",
      medicalLimit: plan.medicalLimit,
      medicalUsed: 0,
      benefits: json(plan.benefits),
      brokerName: MITRA.name,
      brokerCode: MITRA.code,
      brokerEmail: MITRA.email,
    },
    update: {},
  });
  let kase = await prisma.case.findFirst({ where: { patientId: patient.id, title: BUDI_CASE.title }, select: { id: true } });
  if (!kase) {
    kase = await prisma.case.create({
      data: {
        ref: await nextRef("case"),
        ...BUDI_CASE,
        country: "Turkiye",
        assistanceType: "HOSPITALIZATION",
        priority: "MEDIUM",
        status: "IN_PROGRESS",
        urgency: "Discharged; the claim waits for the hospital's itemised invoice",
        symptoms: ["vomiting", "dehydration"],
        patientId: patient.id,
        createdAt: new Date(Date.now() - 6 * 86_400_000),
      },
      select: { id: true },
    });
  }
  const claim = await prisma.claim.findFirst({ where: { patientId: patient.id, caseId: kase.id }, select: { id: true } });
  if (!claim) {
    const submitted = new Date(Date.now() - 4 * 86_400_000);
    await prisma.claim.create({
      data: {
        ref: await nextRef("claim"),
        status: "INFO_REQUESTED",
        ...BUDI_CLAIM,
        issues: json(BUDI_CLAIM.issues),
        history: json([
          { at: submitted.toISOString(), action: "Claim submitted", note: "Direct billing by the hospital" },
          { at: new Date(submitted.getTime() + 86_400_000).toISOString(), action: "Information requested", note: "Itemised invoice asked from the hospital" },
        ]),
        patientId: patient.id,
        caseId: kase.id,
        createdAt: submitted,
      },
    });
  }
}

// ---- What each caller hears ---------------------------------------------------

const KIND_WORDS: Record<string, string> = {
  MEDICAL_REPORT: "medical report",
  HOSPITAL_INVOICE: "hospital invoice",
  DISCHARGE_SUMMARY: "discharge summary",
  PRESCRIPTION: "prescription",
  RECEIPT: "receipt",
  COST_ESTIMATE: "cost estimate",
  POLICE_REPORT: "police report",
  ID_DOCUMENT: "identity document",
};

const spoken = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(d);
const money = (n: number, ccy: string | null) => `${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}${ccy ? ` ${ccy}` : ""}`;

interface Inputs {
  status: ClaimStatus;
  missing: string[];
  planPays: string | null;
  paidOn: string | null;
}

/** The claim's status in the words each caller hears. */
export function statusViews({ status, missing, planPays, paidOn }: Inputs): { for_member: StatusView; for_provider: StatusView; for_broker: StatusView } {
  const waiting = missing.length ? missing.join(" and ").toLowerCase() : "a document";
  switch (status) {
    case "SUBMITTED":
    case "PROCESSING":
      return {
        for_member: { status: "The claim has been received and its documents are being checked.", next_step: "Nothing for now; we tell you if anything is missing." },
        for_provider: { status: "The claim is registered and its documents are being checked; the review has not started yet.", next_step: "Nothing for now; we contact you if a document is missing." },
        for_broker: { status: "The claim has been received and is being registered.", next_step: "Nothing for now; the member is told if anything is missing." },
      };
    case "NEEDS_REVIEW":
      return {
        for_member: { status: "All documents are in and the claims team is reviewing the claim.", next_step: "Nothing; the review usually takes a few working days." },
        for_provider: { status: "The invoice and the medical documents are with the medical and billing review; payment follows approval.", next_step: "Nothing needed from you now." },
        for_broker: { status: "The file is complete and under review by the claims team.", next_step: "Nothing; the member hears as soon as it is decided." },
      };
    case "INFO_REQUESTED":
      return {
        for_member: { status: `The claim is waiting for the ${waiting}.`, next_step: "We have asked the hospital for it; if you have a copy, you may upload it with the link in your e-mail." },
        for_provider: { status: `The claim cannot be paid until we receive the ${waiting}.`, next_step: `Please send the ${waiting}; payment is prepared as soon as it is in.`, waiting_for: missing },
        for_broker: { status: `The claim is waiting for the ${waiting}; we have asked the hospital for it.`, next_step: "Nothing from you; we are chasing it with the hospital." },
      };
    case "APPROVED":
      return {
        for_member: { status: `The claim is approved${planPays ? `: the plan pays ${planPays}` : ""}.`, next_step: "Nothing; the payment is being prepared." },
        for_provider: { status: `The claim is approved for payment${planPays ? ` of ${planPays}` : ""}.`, next_step: "Nothing; the remittance advice follows the payment.", ...(planPays ? { amount_approved: planPays } : {}) },
        for_broker: { status: "The claim is approved and the payment is being prepared.", next_step: "Nothing." },
      };
    case "PAID":
      return {
        for_member: { status: `The claim is paid${paidOn ? ` (${paidOn})` : ""}.`, next_step: "Nothing. If the hospital still writes to you, send us the letter." },
        for_provider: { status: `The claim is paid${paidOn ? `, on ${paidOn}` : ""}.`, next_step: "If the payment hasn't reached you, a case manager traces it with the remittance details.", ...(paidOn ? { paid_on: paidOn } : {}) },
        for_broker: { status: "The claim is settled and paid.", next_step: "Nothing." },
      };
    case "REJECTED":
      return {
        for_member: { status: "The claim was declined; the decision letter gives the reason.", next_step: "A case manager can go through the decision with you." },
        for_provider: { status: "The claim is not payable under the member's policy; the member has been told.", next_step: "A case manager can explain the decision." },
        for_broker: { status: "The claim was declined; the member has the decision letter.", next_step: "A case manager can explain the reason." },
      };
    default:
      return {
        for_member: { status: "A case manager is handling the claim personally.", next_step: "The case manager contacts you." },
        for_provider: { status: "A case manager is handling the claim personally.", next_step: "The case manager contacts you." },
        for_broker: { status: "A case manager is handling the claim personally.", next_step: "The case manager contacts the member and can update you." },
      };
  }
}

/** CareTrail's own claims, as the claim status line sees them. */
export async function claimStatusCases(): Promise<ClaimStatusFacts[]> {
  await ensureClaimStatusRecords().catch((err) => console.error("[claim-status] demo records:", err));
  const claims = await prisma.claim.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      patient: { include: { policy: true } },
      case: { select: { ref: true, title: true } },
      documents: { select: { kind: true, extraction: { select: { hospital: true } } } },
    },
  });
  return claims.map((c) => {
    const issues = (Array.isArray(c.issues) ? c.issues : []) as { severity?: string; message?: string }[];
    const missing = issues.filter((i) => i.severity === "error" && i.message).map((i) => i.message!.replace(/\s+missing$/i, "").trim());
    const settlement = c.settlement as Settlement | null;
    const history = (Array.isArray(c.history) ? c.history : []) as { at?: string; action?: string }[];
    const paid = history.find((h) => /paid/i.test(h.action ?? ""));
    const policy = c.patient.policy;
    return {
      ref: c.ref,
      member: `${c.patient.firstName} ${c.patient.lastName}`,
      dob: c.patient.dateOfBirth.toISOString().slice(0, 10),
      policy_number: c.patient.policyNumber,
      member_language: c.patient.language,
      provider: c.providerName ?? c.documents.find((d) => d.extraction?.hospital)?.extraction?.hospital ?? null,
      broker: policy?.brokerCode ? { name: policy.brokerName ?? "", code: policy.brokerCode } : null,
      treatment: c.case?.title ?? null,
      dates: `submitted ${spoken(c.createdAt)}`,
      amount: c.amount != null ? money(Number(c.amount), c.currency) : null,
      documents_received: [
        ...new Set([
          ...c.documents.map((d) => KIND_WORDS[d.kind] ?? d.kind.toLowerCase().replace(/_/g, " ")),
          // A completeness check's "Medical report received" counts too, when the file itself isn't attached here.
          ...issues.filter((i) => i.severity === "ok" && /\breceived$/i.test(i.message ?? "")).map((i) => i.message!.replace(/\s+received$/i, "").toLowerCase()),
        ]),
      ],
      documents_missing: missing,
      ...statusViews({
        status: c.status,
        missing,
        planPays: settlement ? money(settlement.payable, settlement.currency) : null,
        paidOn: paid?.at ? spoken(new Date(paid.at)) : null,
      }),
    };
  });
}
