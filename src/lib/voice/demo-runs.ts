import type { LeadSegment } from "@/lib/meeting-notes";
import { HOTLINE_SCRIPTS } from "./call-scripts";

// ---------------------------------------------------------------------------
// Fifteen-minute demo runs: for each kind of prospect, three or four voice
// agents in the order that tells their story, each on the demo case that fits
// it, with the lines the presenter says as the other side. Pure data (no
// database), so the Voice Agents page, the lead page and ⌘K can all read it;
// `/api/voice/demo-runs` adds whether each step's case is ready. A step can
// also run on a real phone (the presenter's own): the agent is then told the
// exchange the step expects (`rehearsalNote`), so the call stays to the point.
// ---------------------------------------------------------------------------

export interface DemoCue {
  /** What the presenter says, playing the other side. */
  say: string;
  /** What the agent does in reply. */
  hear: string;
}

export interface DemoStep {
  id: string;
  title: string;
  agentId: string;
  /** The seeded case the step runs on (agents that call about a case). */
  caseRef?: string;
  /** The record it runs on instead (an invoice). */
  record?: string;
  /** The language to open in, when the step is tied to one; otherwise the picker's choice (set it to the prospect's). */
  language?: string;
  /** For hotline and booking steps: the Call Center script whose lines to read. */
  scriptId?: string;
  /** For outbound steps: the lines to answer with. */
  cues?: DemoCue[];
  youPlay: string;
  minutes: number;
}

export interface DemoTrack {
  id: LeadSegment;
  label: string;
  /** Who this run is for, in a line. */
  audience: string;
  steps: DemoStep[];
}

const ADMISSIONS_CUES: DemoCue[] = [
  { say: "Admissions, good morning.", hear: "Says it's an AI calling for the assistance company and identifies Oliver Bennett by name and date of birth." },
  { say: "He's admitted in the coronary care unit. Dr Aylin Kaya is treating him.", hear: "Asks one thing at a time: the ward, the doctor, the estimated total cost and its currency, when the medical report will be ready." },
  { say: "The estimate is 85,000 lira. The report is ready tomorrow.", hear: "Repeats the figure and the date back, asks for the report by e-mail and spells the address, then records the hospital update on the case." },
];

const TRANSPORT_CUES: DemoCue[] = [
  { say: "Dr Kaya, cardiology.", hear: "Asks for the treating doctor of Lena Koch and confirms her name and date of birth." },
  { say: "She's stable after a stent. Fit to fly from Monday, seated with a wheelchair, two litres of oxygen a minute, and a nurse escort.", hear: "Repeats every answer back and records the assessment; the rules pick the safest option that isn't more than she needs and request quotes." },
];

const BILL_CUES: DemoCue[] = [
  { say: "Billing department.", hear: "Says it's an AI calling for the cost-containment desk, names Lena Koch, the invoice and the guarantee, and that the invoice was reviewed line by line against the tariff." },
  { say: "That invoice is correct. We can't accept a reduction.", hear: "Explains the two or three largest findings in a sentence each and repeats its opening offer." },
  { say: "We could come down a little, but not that far.", hear: "Makes its second offer, once. It accepts any figure at or below its private limit and never names that limit." },
  { say: "All right, agreed. The patient won't be billed the difference.", hear: "Repeats the agreed amount, asks who it's speaking to and for a corrected invoice by e-mail, and records the agreement on the case." },
];

const CLAIM_CUES: DemoCue[] = [
  { say: "Hello, James speaking.", hear: "Says it's an AI of the claims team and confirms it's speaking to James Carter." },
  { say: "What's still missing from my claim?", hear: "Names CLM-10243 and exactly what is missing (the discharge summary and the policy number), and why each is needed." },
  { say: "Yes, send me the link.", hear: "Sends a secure upload link by text to the phone on file and says what happens next: review on arrival, payment usually within ten business days of approval." },
];

const LOG_CUES: DemoCue[] = [
  { say: "Billing office.", hear: "Says it's an AI calling for the assistance desk, gives Oliver Bennett, LOG-0903 and the guaranteed amount, and says when and how the letter was sent." },
  { say: "Yes, it arrived this morning. Nothing else needed.", hear: "Confirms receipt on the case and ends. (Say it didn't arrive instead: it takes the fax number digit by digit and promises a resend.)" },
];

const PAYER_CUES: DemoCue[] = [
  { say: "Accounts payable.", hear: "Says it's an AI calling for Saranda Demo Polyclinic's billing office, gives Erik Lindqvist, the guarantee reference, the invoice number and the amount." },
  { say: "It's in review. Payment is scheduled for next Friday.", hear: "Repeats the status and the date back and records the payer's answer on the invoice. (Say the medical report is missing instead: it writes down exactly what, and promises it today.)" },
];

const REMINDER_CUES: DemoCue[] = [
  { say: "Hello?", hear: "Says it's an AI of the assistance company, asks for Siobhan Murphy, and reminds her of tomorrow's eye appointment: doctor, clinic, address and time." },
  { say: "Yes, I'll be there.", hear: "Confirms the appointment on the case and reminds her to bring her passport and policy number. (Ask to move it instead: it finds a new slot, books it and cancels the old one.)" },
];

const WELLBEING_CUES: DemoCue[] = [
  { say: "Hi, Carlos here.", hear: "Says it's an AI of the assistance company, asks if it's a good moment, and asks how the knee is since yesterday's visit." },
  { say: "Much better, thanks. I fly home on Saturday.", hear: "Records the follow-up, wishes a good trip and mentions the 24/7 line. (Say you feel worse instead: the on-call doctor takes over.)" },
];

export const DEMO_TRACKS: DemoTrack[] = [
  {
    id: "assistance",
    label: "Assistance company",
    audience: "A case platform buyer: the 24/7 desk, the calls that fill it, and every call filed on the case.",
    steps: [
      {
        id: "where-is-my-case",
        title: "“Where is my case?”",
        agentId: "inbound-hotline",
        scriptId: "where-is-my-case",
        youPlay: "Carlos Garcia, knee injury in Beşiktaş (CASE-1015)",
        minutes: 4,
      },
      {
        id: "book-doctor",
        title: "A traveller needs a doctor",
        agentId: "appointment-booking",
        scriptId: "book-doctor",
        youPlay: "A traveller in Taksim",
        minutes: 4,
      },
      {
        id: "reminder",
        title: "The reminder call",
        agentId: "outbound-appointment-reminder",
        caseRef: "CASE-1016",
        cues: REMINDER_CUES,
        youPlay: "Siobhan Murphy, whose eye appointment is tomorrow",
        minutes: 3,
      },
      {
        id: "wellbeing",
        title: "The follow-up call",
        agentId: "outbound-wellbeing-followup",
        caseRef: "CASE-1015",
        cues: WELLBEING_CUES,
        youPlay: "Carlos Garcia, the day after his visit",
        minutes: 3,
      },
    ],
  },
  {
    id: "insurer",
    label: "Large group or insurer",
    audience: "A voice pilot on one flow: hospitals chasing guarantees, and claims completed by phone.",
    steps: [
      {
        id: "hospital-line",
        title: "A hospital asks about a guarantee",
        agentId: "inbound-provider-line",
        scriptId: "hospital-guarantee",
        youPlay: "Marmara Demo Heart Center's international desk",
        minutes: 4,
      },
      {
        id: "log-check",
        title: "Did the letter arrive?",
        agentId: "outbound-log-confirmation",
        caseRef: "CASE-1024",
        cues: LOG_CUES,
        youPlay: "The hospital's billing office",
        minutes: 3,
      },
      {
        id: "claim-docs",
        title: "The claim that's missing documents",
        agentId: "outbound-claim-missing-info",
        caseRef: "CASE-1021",
        cues: CLAIM_CUES,
        youPlay: "James Carter, the claimant",
        minutes: 4,
      },
      {
        id: "flight-delay",
        title: "“Is my flight delay covered?”",
        agentId: "inbound-hotline",
        scriptId: "flight-delay",
        youPlay: "James Carter, Premier policy POL-TR-100945",
        minutes: 3,
      },
    ],
  },
  {
    id: "cost-containment",
    label: "Cost containment",
    audience: "Bill review buyers: the euros found on an invoice, and the call that agrees them.",
    steps: [
      {
        id: "bill-negotiation",
        title: "Negotiate the overbilled invoice",
        agentId: "outbound-bill-negotiation",
        caseRef: "CASE-1022",
        cues: BILL_CUES,
        youPlay: "Marmara Demo Heart Center's billing office (push back)",
        minutes: 6,
      },
      {
        id: "claim-status",
        title: "“Where is my claim?”",
        agentId: "inbound-hotline",
        scriptId: "claim-status",
        youPlay: "Siobhan Murphy, claim CLM-10241",
        minutes: 3,
      },
      {
        id: "payer",
        title: "The other side: chasing a payer",
        agentId: "outbound-payment-followup",
        record: "RCV-0905",
        cues: PAYER_CUES,
        youPlay: "The payer's accounts desk, abroad",
        minutes: 4,
      },
    ],
  },
  {
    id: "hospital",
    label: "Hospital international desk",
    audience: "A hospital that chases guarantees and payments by phone, in languages its desk doesn't speak.",
    steps: [
      {
        id: "hospital-line",
        title: "Your desk calls about a guarantee",
        agentId: "inbound-provider-line",
        scriptId: "hospital-guarantee",
        youPlay: "The hospital's international patient desk",
        minutes: 4,
      },
      {
        id: "payer",
        title: "Chasing the payer's invoice",
        agentId: "outbound-payment-followup",
        record: "RCV-0905",
        cues: PAYER_CUES,
        youPlay: "The payer's accounts desk, abroad",
        minutes: 4,
      },
      {
        id: "coordination",
        title: "The assistance company calls your admissions desk",
        agentId: "outbound-hospital-coordination",
        caseRef: "CASE-1024",
        cues: ADMISSIONS_CUES,
        youPlay: "The admissions desk",
        minutes: 4,
      },
      {
        id: "transport",
        title: "Planning the journey home",
        agentId: "outbound-medical-transport",
        caseRef: "CASE-1022",
        cues: TRANSPORT_CUES,
        youPlay: "The treating cardiologist",
        minutes: 3,
      },
    ],
  },
  {
    id: "air-ambulance",
    label: "Air ambulance or repatriation",
    audience: "Operators who want the assessment call to turn into a quote request without a hand-written brief.",
    steps: [
      {
        id: "transport",
        title: "The assessment call",
        agentId: "outbound-medical-transport",
        caseRef: "CASE-1022",
        cues: TRANSPORT_CUES,
        youPlay: "The treating cardiologist",
        minutes: 5,
      },
      {
        id: "coordination",
        title: "Coordinating with the hospital",
        agentId: "outbound-hospital-coordination",
        caseRef: "CASE-1024",
        cues: ADMISSIONS_CUES,
        youPlay: "The admissions desk",
        minutes: 4,
      },
      {
        id: "wellbeing",
        title: "After discharge",
        agentId: "outbound-wellbeing-followup",
        caseRef: "CASE-1015",
        cues: WELLBEING_CUES,
        youPlay: "Carlos Garcia, the day after his visit",
        minutes: 3,
      },
    ],
  },
  {
    id: "partner",
    label: "Technology partner",
    audience: "A CTO or integrator: the agents' tool steps, the records they write, and the API behind them.",
    steps: [
      {
        id: "flight-delay",
        title: "A coverage question, with its tool steps",
        agentId: "inbound-hotline",
        scriptId: "flight-delay",
        youPlay: "James Carter, Premier policy POL-TR-100945",
        minutes: 3,
      },
      {
        id: "bill-negotiation",
        title: "A negotiation with a private limit",
        agentId: "outbound-bill-negotiation",
        caseRef: "CASE-1022",
        cues: BILL_CUES,
        youPlay: "The hospital's billing office (push back)",
        minutes: 5,
      },
      {
        id: "claim-docs",
        title: "A claim completed by phone",
        agentId: "outbound-claim-missing-info",
        caseRef: "CASE-1021",
        cues: CLAIM_CUES,
        youPlay: "James Carter, the claimant",
        minutes: 4,
      },
    ],
  },
];

export function demoTrack(id: string | null | undefined): DemoTrack | null {
  return DEMO_TRACKS.find((t) => t.id === id) ?? null;
}

/** The agents a track's steps need prepared (hotline steps need nothing). */
export function trackAgents(track: DemoTrack): string[] {
  return [...new Set(track.steps.filter((s) => s.caseRef || s.record).map((s) => s.agentId))];
}

/** A run and one of its steps by id, as a demo-step phone call names them. */
export function demoStep(trackId: string | null | undefined, stepId: string | null | undefined): { track: DemoTrack; step: DemoStep } | null {
  const track = demoTrack(trackId);
  const step = track?.steps.find((s) => s.id === stepId);
  return track && step ? { track, step } : null;
}

/** The lines of a step: its own cues, or the turns of the hotline script it reads. */
export function stepCues(step: DemoStep): DemoCue[] {
  return step.cues ?? HOTLINE_SCRIPTS.find((s) => s.id === step.scriptId)?.turns ?? [];
}

/**
 * What the agent is told when a demo step runs on a real phone: who the
 * presenter plays and the exchange they expect, turn by turn, so the agent
 * keeps to that order and the presenter's lines fit. Facts still come from
 * its tools: the note describes the flow, never the answers.
 */
export function rehearsalNote(step: DemoStep): string {
  const turns = stepCues(step)
    .map((c, i) => `${i + 1}. They say: "${c.say}" You then: ${c.hear}`)
    .join(" ");
  return (
    `This call is a demonstration rehearsal: the person on the line is a presenter playing ${step.youPlay}, showing you to a prospect. ` +
    `The exchange they expect, in order: ${turns} ` +
    "Keep to this order and keep each turn short, so their next line fits. Never say their lines or answer for them: wait for each. " +
    "Every fact still comes from your tools, as usual."
  );
}
