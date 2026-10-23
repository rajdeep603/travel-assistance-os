import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { round2 } from "@/lib/fx";
import { storeUpload } from "@/lib/uploads";
import { decideBillReview, reviewResult } from "./bill-review-service";
import type { BillFinding, ReviewedLine } from "./bill-review";
import { committedGuarantees, convert } from "./exposure";
import type { Benefit } from "./policy";
import { emit } from "./webhooks";

// ---------------------------------------------------------------------------
// Claim adjudication as rules, not judgement: from the invoices' bill review
// and the traveller's policy, what the plan pays and what the traveller pays,
// with a reason for every step. The rules recommend; a person approves, and
// approving produces the explanation of benefits (EOB) for the traveller and
// the hospital. The language model never decides an amount.
// ---------------------------------------------------------------------------

export const SETTLEMENT_RULESET = "demo-settlement-v1";

/** EOB remark codes, one per bill review finding. */
export const REMARKS: Record<BillFinding["rule"], { code: string; text: string }> = {
  DUPLICATE: { code: "D1", text: "Billed twice: paid once" },
  NON_MEDICAL: { code: "N1", text: "Comfort or convenience item: not covered" },
  EXTRA_NIGHTS: { code: "S1", text: "Nights beyond the stay: not payable" },
  PRICE_ABOVE_REFERENCE: { code: "P1", text: "Above the reference or network price: paid at that price" },
  NO_REFERENCE: { code: "Q1", text: "No reference price: checked by a person" },
  ARITHMETIC: { code: "A1", text: "Quantity × price corrected" },
  TOTAL_MISMATCH: { code: "T1", text: "Invoice total does not match its lines" },
};

export interface SettlementLine {
  invoice: string;
  code: string | null;
  description: string;
  billed: number;
  allowed: number;
  remarks: string[];
}

export interface SettlementCheck {
  label: string;
  ok: boolean;
}

export interface Settlement {
  ruleset: string;
  currency: string;
  billed: number;
  /** Comfort items and duplicates: never covered. */
  notCovered: number;
  /** Above the reference or network price, extra nights: not owed by the plan or the traveller under the agreement. */
  aboveReference: number;
  /** What the plan recognises before the excess and the limit. */
  allowed: number;
  excess: number;
  /** Above what the policy can still pay. */
  overLimit: number;
  /** What the plan pays. */
  payable: number;
  /** What the traveller owes: the excess, anything over the limit and items never covered. */
  travellerPays: number;
  benefit: { code: string; label: string };
  policy: { number: string; plan: string; currency: string; remaining: number } | null;
  lines: SettlementLine[];
  reasons: string[];
  checks: SettlementCheck[];
  /** Why a person must look before approving (empty: approve as recommended). */
  attention: string[];
  /** Out of network: the hospital may bill the traveller the amount above the reference unless it agrees. */
  balanceBillingRisk: number;
}

const money = (n: number, ccy: string) => `${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;

type ClaimForSettlement = Prisma.ClaimGetPayload<{
  include: {
    patient: { include: { policy: true } };
    documents: { include: { extraction: true; billReview: true } };
  };
}>;

async function loadClaim(claimId: string): Promise<ClaimForSettlement> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { patient: { include: { policy: true } }, documents: { include: { extraction: true, billReview: true } } },
  });
  if (!claim) throw notFound("Claim");
  return claim;
}

/** What the rules recommend paying on a claim, from its invoices' bill reviews and the policy. */
export async function recommendSettlement(claimId: string, claimIn?: ClaimForSettlement): Promise<Settlement> {
  const claim = claimIn ?? (await loadClaim(claimId));
  const invoices = claim.documents.filter((d) => d.kind === "HOSPITAL_INVOICE" && d.extraction);
  const first = invoices[0]?.extraction;
  const currency = (first?.currency ?? claim.currency ?? claim.patient.policy?.currency ?? "EUR").toUpperCase();
  const reasons: string[] = [];
  const attention: string[] = [];
  const lines: SettlementLine[] = [];

  let billed = 0;
  let notCovered = 0;
  let allowed = 0;
  let unreviewed = 0;
  for (const doc of invoices) {
    const ex = doc.extraction!;
    const name = ex.documentNumber ?? doc.filename;
    const docCcy = (ex.currency ?? currency).toUpperCase();
    const inCcy = (n: number) => round2(convert(n, docCcy, currency));
    const review = doc.billReview;
    if (!review) {
      const amount = Number(ex.invoiceAmount ?? 0);
      billed += inCcy(amount);
      allowed += inCcy(amount);
      unreviewed++;
      lines.push({ invoice: name, code: null, description: `${name} (not reviewed line by line)`, billed: inCcy(amount), allowed: inCcy(amount), remarks: [] });
      continue;
    }
    const result = reviewResult(review);
    billed += inCcy(Number(review.billed));
    if (review.status === "WAIVED") {
      allowed += inCcy(Number(review.billed));
      reasons.push(`${name}: the bill review was waived by ${review.decidedBy ?? "a person"}, so it is paid as billed.`);
    } else {
      notCovered += inCcy(result.notCovered);
      // The recommendation already leaves out what is never covered; an amount agreed on a call replaces it.
      allowed += inCcy(Number(review.agreedAmount ?? review.recommended));
      if (review.status === "PROPOSED") attention.push(`The bill review of ${name} is waiting for a decision; approving the settlement accepts it.`);
      if (review.agreedAmount != null) reasons.push(`${name}: the hospital agreed to ${money(Number(review.agreedAmount), review.currency)} on a negotiation call.`);
    }
    const byLine = new Map<number, string[]>();
    for (const f of result.findings) {
      if (f.line == null) continue;
      const r = REMARKS[f.rule];
      byLine.set(f.line, [...(byLine.get(f.line) ?? []), `${r.code} ${r.text}`]);
    }
    result.lines.forEach((l: ReviewedLine, i: number) => {
      lines.push({
        invoice: name,
        code: l.code,
        description: l.description,
        billed: inCcy(l.billed),
        allowed: inCcy(review.status === "WAIVED" ? l.billed : l.recommended),
        remarks: review.status === "WAIVED" ? [] : (byLine.get(i) ?? []),
      });
    });
  }
  if (invoices.length === 0 && claim.amount != null) {
    const amount = round2(convert(Number(claim.amount), (claim.currency ?? currency).toUpperCase(), currency));
    billed = amount;
    allowed = amount;
    unreviewed++;
    lines.push({ invoice: claim.ref, code: null, description: "Amount claimed (no itemised invoice)", billed: amount, allowed: amount, remarks: [] });
  }
  billed = round2(billed);
  notCovered = round2(notCovered);
  allowed = round2(Math.max(0, allowed));
  // Room-and-board lines mean an inpatient stay: the hospital admission benefit applies.
  const inpatient = !!(first?.admissionDate && first?.dischargeDate);
  const benefitCode = inpatient ? "HOSPITALIZATION" : "MEDICAL_EXPENSES";
  const policy = claim.patient.policy;
  const benefits = (policy?.benefits as unknown as Benefit[] | undefined) ?? [];
  const benefit = benefits.find((b) => b.code === benefitCode) ?? null;
  const checks: SettlementCheck[] = [];

  let excess = 0;
  let overLimit = 0;
  let remainingInCcy = Number.POSITIVE_INFINITY;
  let policyOut: Settlement["policy"] = null;
  if (!policy) {
    attention.push("No policy on file for this traveller: check cover before paying.");
    checks.push({ label: "Policy on file", ok: false });
  } else {
    const on = first?.admissionDate ? new Date(`${first.admissionDate}T12:00:00Z`) : claim.createdAt;
    const valid = on >= policy.validFrom && on <= policy.validTo;
    checks.push({ label: `Policy ${policy.number} valid on the treatment date`, ok: valid });
    if (!valid) attention.push("The treatment date is outside the policy period.");
    checks.push({ label: `${benefit?.label ?? benefitCode} covered on the ${policy.plan} plan`, ok: !!benefit?.covered });
    if (!benefit?.covered) attention.push(`${benefit?.label ?? benefitCode} is not covered on the ${policy.plan} plan.`);
    const excessPolicyCcy = benefit?.excess ?? 0;
    excess = round2(Math.min(allowed, convert(excessPolicyCcy, policy.currency, currency)));
    const committed = await committedGuarantees(claim.patientId, policy.currency, {});
    // This treatment's own guarantee is what this settlement pays; it doesn't count against the limit twice.
    const ownLetters = claim.caseId
      ? await prisma.guaranteeLetter.findMany({ where: { caseId: claim.caseId, status: { in: ["APPROVED", "SENT", "ACKNOWLEDGED"] } }, select: { ref: true } })
      : [];
    const ownRefs = new Set(ownLetters.map((l) => l.ref));
    const otherCommitted = committed.letters.filter((l) => !ownRefs.has(l.ref)).reduce((s, l) => s + convert(l.amount, l.currency, policy.currency), 0);
    const remaining = Math.max(0, Number(policy.medicalLimit) - Number(policy.medicalUsed) - otherCommitted);
    remainingInCcy = round2(convert(remaining, policy.currency, currency));
    policyOut = { number: policy.number, plan: policy.plan, currency: policy.currency, remaining: round2(remaining) };
    checks.push({ label: `Within the remaining medical limit (${money(round2(remaining), policy.currency)})`, ok: allowed - excess <= remainingInCcy });
  }
  const afterExcess = Math.max(0, allowed - excess);
  overLimit = round2(Math.max(0, afterExcess - remainingInCcy));
  const covered = !policy || benefit?.covered !== false;
  const payable = covered ? round2(afterExcess - overLimit) : 0;
  const travellerPays = round2(excess + overLimit + notCovered + (covered ? 0 : afterExcess));
  const aboveReference = round2(Math.max(0, billed - notCovered - allowed));

  // Plain-language steps, in the order the rules apply them.
  reasons.unshift(`Billed: ${money(billed, currency)}${invoices.length > 1 ? ` on ${invoices.length} invoices` : ""}.`);
  if (notCovered > 0) reasons.push(`${money(notCovered, currency)} is never covered (comfort items, charges billed twice): the hospital bills it to the traveller.`);
  if (aboveReference > 0) reasons.push(`${money(aboveReference, currency)} is above the reference or network price, or beyond the stay: not owed under the agreement.`);
  reasons.push(`The plan recognises ${money(allowed, currency)} under ${benefit?.label ?? benefitCode}.`);
  if (excess > 0) reasons.push(`The traveller's excess is ${money(excess, currency)}.`);
  if (overLimit > 0) reasons.push(`${money(overLimit, currency)} is above what the policy can still pay.`);
  reasons.push(covered ? `The plan pays ${money(payable, currency)}; the traveller pays ${money(travellerPays, currency)}.` : "Not covered: the plan pays nothing.");

  const issues = Array.isArray(claim.issues) ? (claim.issues as { severity: string; message: string }[]) : [];
  const missing = issues.filter((i) => i.severity === "error").map((i) => i.message);
  checks.push({ label: "Documents complete", ok: missing.length === 0 });
  if (missing.length) attention.push(`Documents missing: ${missing.join("; ")}.`);
  const signals = Array.isArray(claim.signals) ? (claim.signals as { level?: string; reason?: string }[]) : [];
  if (signals.some((s) => s.level === "HIGH" || s.level === "MEDIUM")) attention.push("Integrity signals on this claim: review them before paying.");
  if (unreviewed > 0) attention.push("An amount was not reviewed line by line.");

  // A hospital outside the network may bill the traveller for what the plan doesn't pay above the reference.
  const outOfNetwork = invoices.some((d) => /out-of-network|out of network/i.test(d.textContent ?? ""));
  const balanceBillingRisk = outOfNetwork ? aboveReference : 0;
  if (balanceBillingRisk > 0) attention.push(`Out of network: agree the ${money(balanceBillingRisk, currency)} above the reference with the hospital so the traveller isn't billed for it.`);

  return {
    ruleset: SETTLEMENT_RULESET,
    currency,
    billed,
    notCovered,
    aboveReference,
    allowed,
    excess,
    overLimit,
    payable,
    travellerPays,
    benefit: { code: benefitCode, label: benefit?.label ?? benefitCode },
    policy: policyOut,
    lines,
    reasons,
    checks,
    attention,
    balanceBillingRisk,
  };
}

const actorOf = (by: string) => (by.startsWith("system") || by.startsWith("agent:") ? by : `operator:${by}`);

/** A person approves the recommended settlement: the claim is approved for that amount and the EOB is issued. */
export async function settleClaim(claimId: string, by: string) {
  const claim = await loadClaim(claimId);
  if (claim.status === "PAID") throw conflict("This claim is already paid.");
  if (claim.settlement) throw conflict("This claim is already settled.");
  // Settling accepts the bill reviews still waiting for a decision.
  for (const doc of claim.documents) {
    if (doc.billReview?.status === "PROPOSED") await decideBillReview(doc.billReview.id, "ACCEPTED", by, `Accepted with the settlement of ${claim.ref}.`);
  }
  const fresh = await loadClaim(claimId);
  const settlement = await recommendSettlement(claimId, fresh);
  const eob = await storeEob(fresh, settlement, by);
  const history = Array.isArray(fresh.history) ? [...fresh.history] : [];
  history.push({
    at: new Date().toISOString(),
    action: "Settlement approved",
    note: `Plan pays ${money(settlement.payable, settlement.currency)}; traveller pays ${money(settlement.travellerPays, settlement.currency)}. Explanation of benefits issued.`,
    by,
  });
  const updated = await prisma.claim.update({
    where: { id: claimId },
    data: {
      status: "APPROVED",
      settlement: { ...settlement, approvedBy: by, approvedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue,
      eobDocumentId: eob.id,
      history,
    },
  });
  emit("claim.settled", { ref: fresh.ref, planPays: settlement.payable, travellerPays: settlement.travellerPays, currency: settlement.currency, approvedBy: by, eobDocumentId: eob.id });
  if (fresh.caseId) {
    await prisma.caseEvent.create({
      data: {
        caseId: fresh.caseId,
        type: "CLAIM",
        title: `${fresh.ref} settled: plan pays ${money(settlement.payable, settlement.currency)}`,
        body: settlement.reasons.join(" "),
        data: { claimRef: fresh.ref, eobDocumentId: eob.id },
        actor: actorOf(by),
      },
    });
  }
  return { claim: updated, settlement, eobDocumentId: eob.id };
}

async function storeEob(claim: ClaimForSettlement, s: Settlement, by: string) {
  const { renderEob } = await import("./eob-pdf");
  const p = claim.patient;
  const invoice = claim.documents.find((d) => d.kind === "HOSPITAL_INVOICE")?.extraction;
  const pdf = await renderEob({
    claimRef: claim.ref,
    issuedOn: new Date().toISOString().slice(0, 10),
    member: { name: `${p.firstName} ${p.lastName}`, dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10), policy: p.policyNumber, plan: p.policy?.plan ?? "—" },
    provider: invoice?.hospital ?? "—",
    service: { from: invoice?.admissionDate ?? null, to: invoice?.dischargeDate ?? null, diagnosis: invoice?.diagnosis ?? null },
    settlement: s,
    approvedBy: by,
  });
  const filename = `explanation-of-benefits-${claim.ref.toLowerCase()}.pdf`;
  return prisma.document.create({
    data: {
      filename,
      mimeType: "application/pdf",
      sizeBytes: pdf.length,
      kind: "EXPLANATION_OF_BENEFITS",
      status: "PROCESSED",
      source: "GENERATED",
      storagePath: await storeUpload(filename, pdf),
      caseId: claim.caseId,
      patientId: claim.patientId,
    },
  });
}
