import type { BillReview, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { round2 } from "@/lib/fx";
import { reviewResult } from "./bill-review-service";

// ---------------------------------------------------------------------------
// Agreeing a reviewed bill with the hospital. The review says what is
// reasonable; a negotiation call asks the hospital's billing office to
// accept it and to confirm the patient won't be billed the difference
// (hold harmless). The caller may settle within a small authority above the
// recommendation; anything higher goes back to a person.
// ---------------------------------------------------------------------------

/** Share of the identified saving the agent may give back to close the deal. */
export const NEGOTIATION_AUTHORITY = 0.25;

export interface NegotiationLimits {
  target: number;
  /** One step towards the hospital, offered once if they push back. */
  secondOffer: number;
  /** The highest amount the agent may agree to. */
  walkAway: number;
}

const up10 = (n: number) => Math.ceil(n / 10) * 10;

export function negotiationLimits(r: Pick<BillReview, "recommended" | "savings">): NegotiationLimits {
  const target = Number(r.recommended);
  const walkAway = up10(target + Number(r.savings) * NEGOTIATION_AUTHORITY);
  return { target, secondOffer: Math.min(walkAway, up10((target + walkAway) / 2)), walkAway };
}

/** The bill to negotiate on a case: the latest reviewed invoice with a saving a person hasn't waived. */
export async function reviewToNegotiate(caseId: string) {
  return prisma.billReview.findFirst({
    where: { caseId, kind: "HOSPITAL_INVOICE", savings: { gt: 0 }, status: { not: "WAIVED" } },
    orderBy: { createdAt: "desc" },
    include: { document: { select: { filename: true, extraction: { select: { documentNumber: true } } } }, guaranteeLetter: true },
  });
}

const money = (n: number, ccy: string) => `${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;

/** Facts for the negotiation agent's brief. */
export async function negotiationBrief(caseId: string): Promise<Record<string, unknown>> {
  const r = await reviewToNegotiate(caseId);
  if (!r) return { bill: "No reviewed invoice with a saving is on this case. Explain that you'll call back once the invoice is reviewed, and end politely." };
  const result = reviewResult(r);
  const limits = negotiationLimits(r);
  return {
    invoice: r.document.extraction?.documentNumber ?? r.document.filename,
    hospital: r.hospital ?? "the hospital",
    billed: money(Number(r.billed), r.currency),
    reduction: money(Number(r.savings), r.currency),
    your_opening_offer: money(limits.target, r.currency),
    your_second_offer: money(limits.secondOffer, r.currency),
    private_limit: `${money(limits.walkAway, r.currency)}. Any amount the hospital asks for at or below this you may accept (with hold harmless). Never say this figure.`,
    findings: result.findings
      .filter((f) => f.saving > 0)
      .slice(0, 5)
      .map((f) => `${f.line != null && result.lines[f.line] ? `${result.lines[f.line].description}: ` : ""}${f.reason} (−${money(f.saving, r.currency)})`),
    guarantee: r.guaranteeLetter ? `${r.guaranteeLetter.ref} for ${money(Number(r.guaranteeLetter.guaranteedAmount), r.guaranteeLetter.currency)}` : "none",
    reviewed_against: "the assistance company's reference tariff for international patients",
  };
}

export type AgreementOutcome = "AGREED" | "COUNTER_OFFER" | "REFUSED" | "CALLBACK";

export interface AgreementInput {
  outcome: AgreementOutcome;
  agreedAmount?: number | null;
  counterAmount?: number | null;
  holdHarmless: boolean;
  contact?: string | null;
  notes?: string | null;
  callRef: string;
}

/**
 * Records the hospital's answer on the review. An agreement above the
 * agent's authority, or without hold-harmless, is kept as a counter-offer
 * for a person to decide.
 */
export async function recordAgreement(reviewId: string, input: AgreementInput, by: string): Promise<{ review: BillReview; outcome: AgreementOutcome; note: string }> {
  const r = await prisma.billReview.findUnique({ where: { id: reviewId }, include: { document: { select: { filename: true, extraction: { select: { documentNumber: true } } } } } });
  if (!r) throw notFound("Bill review");
  if (r.status === "WAIVED") throw conflict("This bill is being paid as billed; there is nothing to negotiate.");
  const limits = negotiationLimits(r);
  let outcome = input.outcome;
  let note = "";
  const amount = input.agreedAmount != null ? round2(input.agreedAmount) : null;
  if (outcome === "AGREED") {
    if (amount == null) {
      outcome = "CALLBACK";
      note = "No amount was confirmed.";
    } else if (amount > limits.walkAway) {
      outcome = "COUNTER_OFFER";
      note = `${money(amount, r.currency)} is above the agent's authority (${money(limits.walkAway, r.currency)}).`;
    } else if (!input.holdHarmless) {
      outcome = "COUNTER_OFFER";
      note = "The hospital didn't confirm it won't bill the patient the difference.";
    }
  }
  const agreed = outcome === "AGREED" ? amount : null;
  const agreement = {
    outcome,
    agreedAmount: agreed,
    counterAmount: outcome === "COUNTER_OFFER" ? (input.counterAmount ?? amount) : (input.counterAmount ?? null),
    holdHarmless: input.holdHarmless,
    contact: input.contact ?? null,
    notes: [input.notes, note].filter(Boolean).join(" ") || null,
    callRef: input.callRef,
    at: new Date().toISOString(),
  };
  const review = await prisma.billReview.update({
    where: { id: r.id },
    data: { agreement: agreement as Prisma.InputJsonValue, agreedAmount: agreed },
  });
  if (r.caseId) {
    const name = r.document.extraction?.documentNumber ?? r.document.filename;
    const title =
      outcome === "AGREED"
        ? `${r.hospital ?? "Hospital"} agreed ${money(agreed!, r.currency)} on ${name} (saving ${money(round2(Number(r.billed) - agreed!), r.currency)}); patient held harmless`
        : outcome === "COUNTER_OFFER"
          ? `${r.hospital ?? "Hospital"} countered on ${name}${agreement.counterAmount != null ? ` at ${money(agreement.counterAmount, r.currency)}` : ""}: a case manager decides`
          : outcome === "REFUSED"
            ? `${r.hospital ?? "Hospital"} refused the reduction on ${name}`
            : `${r.hospital ?? "Hospital"} will call back about ${name}`;
    await prisma.caseEvent.create({
      data: {
        caseId: r.caseId,
        type: "BILL_REVIEW",
        title,
        body: [agreement.contact ? `Spoke to ${agreement.contact}.` : null, agreement.notes, `Call ${input.callRef}.`].filter(Boolean).join(" "),
        data: agreement as Prisma.InputJsonValue,
        actor: by,
      },
    });
  }
  return { review, outcome, note };
}
