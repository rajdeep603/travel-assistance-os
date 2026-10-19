// ---------------------------------------------------------------------------
// The 60-day pilots a quotation can propose: one call flow or one desk, with
// the measures it is judged on and the same four phases for every pilot.
// Large groups and hospitals buy this shape first, not a platform change.
// Prices are never set here: the presenter types them in the quotation.
// ---------------------------------------------------------------------------

export interface PilotPlan {
  id: string;
  label: string;
  /** What the AI does during the pilot, in one sentence. */
  scope: string;
  /** What the pilot is judged on. */
  measures: string[];
  /** One-time service charges it usually carries (descriptions only). */
  services: string[];
}

export const PILOT_DAYS = 60;

/** Under every pilot: the monthly figures above it are for full volumes. */
export const PILOT_BILLING_NOTE = "During the pilot, services are billed on actual use on this flow only, not at the full monthly volumes above.";

export const PILOT_PHASES: { days: string; what: string }[] = [
  { days: "Days 1–14", what: "Set-up: connect the line or the inbox, load your rules and knowledge, test in your languages." },
  { days: "Days 15–28", what: "Shadow: the AI works alongside your team and a person checks every outcome." },
  { days: "Days 29–56", what: "Live on the agreed share of the traffic, with weekly results against the measures." },
  { days: "Days 57–60", what: "Results review, and the decision to roll out or stop." },
];

export const PILOTS: PilotPlan[] = [
  {
    id: "status-calls",
    label: "“Where is my case?” and after-hours calls",
    scope: "The AI answers the assistance line around the clock in the caller's language: case status, coverage questions and appointments, with emergencies and anything else handed to your team with a summary.",
    measures: [
      "Share of calls the AI resolves without a person",
      "Time to answer, day and night",
      "Calls handed over with a complete summary",
      "Languages served without an interpreter",
    ],
    services: ["Set-up of the 24/7 line in your languages", "Connection to your case records", "Team training and weekly reviews"],
  },
  {
    id: "provider-line",
    label: "Hospital guarantee status line",
    scope: "Hospitals call one number about their guarantees of payment: status and amount, the letter re-sent to the address on file, admission updates and requests to raise a guarantee for a case manager.",
    measures: [
      "Provider calls resolved by the AI",
      "Coordinator minutes saved per call",
      "Letters re-sent without a coordinator",
      "Top-up requests recorded complete",
    ],
    services: ["Set-up of the provider line", "Connection to your guarantee records", "Team training and weekly reviews"],
  },
  {
    id: "gop-intake",
    label: "Guarantees from fax and e-mail",
    scope: "Cost estimates arriving by fax or e-mail are read, checked against the policy and your rules, and turned into a Letter of Guarantee; anything outside the rules waits for a person.",
    measures: [
      "Time from estimate received to letter sent",
      "Share of letters inside the rules, issued without retyping",
      "Exceptions routed to a person with the reason",
      "Hospital chasers avoided",
    ],
    services: ["Set-up of the fax and e-mail intake", "Your guarantee rules and letter template", "Team training and weekly reviews"],
  },
  {
    id: "bill-review",
    label: "Bill review first pass and negotiation",
    scope: "Every hospital invoice is read and checked line by line against your tariff before a person sees it; the AI then calls the billing office to agree the reduction and a hold-harmless.",
    measures: [
      "Euros identified per invoice reviewed",
      "Euros agreed with the hospital",
      "Invoices reviewed per reviewer a day",
      "Agreements with a hold-harmless",
    ],
    services: ["Set-up with your tariff and rules", "Negotiation scripts and limits", "Team training and weekly reviews"],
  },
  {
    id: "transport-intake",
    label: "Medical transport intake",
    scope: "The AI calls the treating doctor for the fit-to-fly assessment, plans the least intensive safe way home with every option's cost, and sends the quote requests.",
    measures: [
      "Time from first call to quote requests sent",
      "Assessments recorded complete",
      "Cost of the chosen option against the most intensive one",
      "Doctor call-backs avoided",
    ],
    services: ["Set-up with your transport rules and vendors", "Connection to your case records", "Team training and weekly reviews"],
  },
];

export function pilotPlan(id: string | null | undefined): PilotPlan | null {
  return PILOTS.find((p) => p.id === id) ?? null;
}
