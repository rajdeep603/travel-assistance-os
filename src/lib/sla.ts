// ---------------------------------------------------------------------------
// Service levels: how long each step of a case took, measured from when it was
// asked for, against targets. Insurers audit assistance companies on these.
// The targets are examples; a client contract sets the real ones.
//
// Pure (no database), so the case page and the dashboard share it.
// ---------------------------------------------------------------------------

export const SLA_TARGETS = {
  /** The phone rings until the AI answers. */
  answerSeconds: 20,
  /** Case opened until someone speaks to the hospital (hospital cases). */
  hospitalMinutes: 120,
  /** The hospital's request (the estimate) until the Letter of Guarantee goes out. */
  guaranteeMinutes: 240,
  /** Case opened until a doctor's appointment is booked (outpatient cases). */
  appointmentMinutes: 120,
} as const;

/** A step not yet done is only "running" on a case this fresh; older gaps were handled off-system. */
const LIVE_HOURS = 24;

export type SlaKey = "answer" | "hospital" | "guarantee" | "appointment";
/** met / missed: done, within or past target. running / overdue: not done yet. */
export type SlaState = "met" | "missed" | "running" | "overdue";

export interface SlaMilestone {
  key: SlaKey;
  label: string;
  /** What the clock runs from, e.g. "from the hospital's request". */
  basis: string;
  targetSeconds: number;
  /** Time taken, or time so far when not done. */
  seconds: number;
  state: SlaState;
  /** The record it was measured on, e.g. LOG-0903. */
  ref?: string | null;
}

export interface SlaInput {
  openedAt: Date;
  assistanceType: string;
  status: string;
  calls: { ref?: string; direction: string; startedAt: Date; answeredAt: Date | null }[];
  /** requestedAt: when the hospital's estimate arrived; the letter's creation when unknown. */
  letters: { ref: string; status: string; createdAt: Date; sentAt: Date | null; requestedAt?: Date | null }[];
  events: { type: string; title: string; createdAt: Date }[];
}

export const SLA_LABELS: Record<SlaKey, { label: string; basis: string; target: number }> = {
  answer: { label: "Call answered", basis: "from the first ring", target: SLA_TARGETS.answerSeconds },
  hospital: { label: "Hospital contacted", basis: "from the case opening", target: SLA_TARGETS.hospitalMinutes * 60 },
  guarantee: { label: "Guarantee sent", basis: "from the hospital's request", target: SLA_TARGETS.guaranteeMinutes * 60 },
  appointment: { label: "Doctor's appointment booked", basis: "from the case opening", target: SLA_TARGETS.appointmentMinutes * 60 },
};

const HOSPITAL_TYPES = new Set(["HOSPITALIZATION", "EVACUATION", "REPATRIATION"]);
const OUTPATIENT_TYPES = new Set(["MEDICAL", "DENTAL"]);
const CLOSED = new Set(["RESOLVED", "CLOSED"]);

const secondsBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 1000);

function milestone(key: SlaKey, seconds: number, done: boolean, ref?: string | null): SlaMilestone {
  const { label, basis, target } = SLA_LABELS[key];
  const state: SlaState = done ? (seconds <= target ? "met" : "missed") : seconds <= target ? "running" : "overdue";
  return { key, label, basis, targetSeconds: target, seconds, state, ref: ref ?? null };
}

/** The service levels of one case, in the order they happen. */
export function caseServiceLevels(input: SlaInput, now = new Date()): SlaMilestone[] {
  const out: SlaMilestone[] = [];
  const open = !CLOSED.has(input.status);
  const live = open && secondsBetween(input.openedAt, now) <= LIVE_HOURS * 3600;
  const byTime = <T extends { createdAt?: Date; startedAt?: Date }>(xs: T[]) =>
    [...xs].sort((a, b) => (a.startedAt ?? a.createdAt)!.getTime() - (b.startedAt ?? b.createdAt)!.getTime());

  const answered = byTime(input.calls.filter((c) => c.direction === "INBOUND" && c.answeredAt))[0];
  if (answered) out.push(milestone("answer", secondsBetween(answered.startedAt, answered.answeredAt!), true, answered.ref));

  const letters = byTime(input.letters.filter((l) => l.status !== "REJECTED"));
  // A hospital case, or one where a hospital asked for a guarantee within a day
  // (urgent care); a planned operation days later isn't timed from the opening.
  const urgentLetter = letters.some((l) => secondsBetween(input.openedAt, l.requestedAt ?? l.createdAt) <= LIVE_HOURS * 3600);
  if (HOSPITAL_TYPES.has(input.assistanceType) || urgentLetter) {
    const contacts = [
      ...input.calls.filter((c) => c.direction === "OUTBOUND").map((c) => ({ at: c.startedAt, ref: c.ref })),
      ...letters.filter((l) => l.sentAt).map((l) => ({ at: l.sentAt!, ref: l.ref })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    if (contacts[0]) out.push(milestone("hospital", secondsBetween(input.openedAt, contacts[0].at), true, contacts[0].ref));
    else if (live) out.push(milestone("hospital", secondsBetween(input.openedAt, now), false));
  }

  const letter = letters[0];
  if (letter) {
    const done = !!letter.sentAt;
    const from = letter.requestedAt ?? letter.createdAt;
    if (done || open) out.push(milestone("guarantee", secondsBetween(from, letter.sentAt ?? now), done, letter.ref));
  }

  if (OUTPATIENT_TYPES.has(input.assistanceType)) {
    const booked = byTime(input.events.filter((e) => e.type === "APPOINTMENT" && /\bbooked\b/i.test(e.title)))[0];
    if (booked) out.push(milestone("appointment", secondsBetween(input.openedAt, booked.createdAt), true));
    else if (live) out.push(milestone("appointment", secondsBetween(input.openedAt, now), false));
  }
  return out;
}

/** 0.9 → "1 s", 2580 → "43 min", 5700 → "1 h 35 min", 108000 → "30 h", 345600 → "4 days". */
export function formatSlaDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 && hours < 10 ? `${hours} h ${minutes % 60} min` : `${Math.round(minutes / 60)} h`;
  return `${Math.round(hours / 24)} days`;
}
