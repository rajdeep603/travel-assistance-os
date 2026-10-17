// ---------------------------------------------------------------------------
// Scripts for calling the 24/7 hotline in a demo: what to say, and what the
// agent should say back. Each one plays a seeded traveller or hospital whose
// records make the answer land (tests/integration/call-scripts.test.ts checks
// those records), and works the same in the browser with the hotline agent.
// ---------------------------------------------------------------------------

export type ScriptIcon = "delay" | "case" | "doctor" | "claim" | "hospital" | "emergency";

export interface CallScript {
  id: string;
  icon: ScriptIcon;
  title: string;
  /** What the agent does in this call, in a line. */
  purpose: string;
  /** Who the presenter plays, and the demo record behind it. */
  youPlay: string;
  turns: { say: string; hear: string }[];
  /** Worth knowing before dialling. */
  note?: string;
}

export const HOTLINE_SCRIPTS: CallScript[] = [
  {
    id: "flight-delay",
    icon: "delay",
    title: "Is my flight delay covered?",
    purpose: "Checks the policy and works out the payout",
    youPlay: "James Carter, Premier policy POL-TR-100945",
    turns: [
      {
        say: "Hi, my flight home from Istanbul was delayed. Is that covered by my travel insurance?",
        hear: "Asks for your policy number and date of birth.",
      },
      {
        say: "My policy number is POL-TR-100945, and my date of birth is the 2nd of November 1979.",
        hear: "Finds your Premier policy and asks how long the delay was.",
      },
      {
        say: "Thirteen hours.",
        hear: "Covered: €100, two full 6-hour blocks at €50. You need the airline's written confirmation, and the claims team makes the final decision.",
      },
    ],
  },
  {
    id: "where-is-my-case",
    icon: "case",
    title: "Where is my case?",
    purpose: "Finds the case without a reference and gives its status",
    youPlay: "Carlos Garcia, knee injury in Beşiktaş (CASE-1015)",
    turns: [
      {
        say: "Hello, this is Carlos Garcia. I hurt my knee in Istanbul. Can you tell me where my case is?",
        hear: "Asks for your date of birth.",
      },
      {
        say: "The 30th of April 1973.",
        hear: "Finds CASE-1015 and tells you where it stands: your appointment, the guarantee of payment with the hospital, and what the claim still needs.",
      },
    ],
  },
  {
    id: "book-doctor",
    icon: "doctor",
    title: "Book a doctor",
    purpose: "Finds a doctor nearby who speaks your language and books the visit",
    youPlay: "Sophie Martin, Plus policy POL-TR-100947",
    turns: [
      {
        say: "Hi, I'm Sophie Martin, policy POL-TR-100947. I'm staying in Taksim and I've had a fever and a sore throat since last night. Can I see a doctor tomorrow afternoon? I speak French or English.",
        hear: "Searches nearby doctors and offers up to three with times.",
      },
      { say: "The first one, please.", hear: "Reads the doctor, date, time and address back, and asks you to confirm." },
      { say: "Yes, please book it.", hear: "Books it and gives you the appointment reference (APT-…) and your case reference (CASE-…)." },
    ],
    note: "Books a real appointment in the demo data.",
  },
  {
    id: "claim-status",
    icon: "claim",
    title: "What's missing on my claim?",
    purpose: "Gives the claim status and exactly what to send",
    youPlay: "Siobhan Murphy, claim CLM-10241",
    turns: [
      {
        say: "Hi, I'm calling about my claim, CLM-10241. What's happening with it?",
        hear: "Says the claims team is waiting for information: the proof of payment is missing.",
      },
      { say: "How do I send it?", hear: "Explains how to send the proof of payment, from the claims procedure." },
    ],
  },
  {
    id: "hospital-guarantee",
    icon: "hospital",
    title: "Hospital: has the guarantee been issued?",
    purpose: "You're the hospital: same number, the agent switches to its provider flow",
    youPlay: "the international patient desk at Marmara Heart Center, patient Lena Koch",
    turns: [
      {
        say: "Hello, this is the international patient desk at Marmara Heart Center. Has the guarantee of payment been issued for our patient Lena Koch?",
        hear: "Asks for the patient's date of birth.",
      },
      {
        say: "The 29th of July 1964.",
        hear: "Guarantee LOG-0902: €11,850, the excess the patient pays, how long it's valid, and the conditions that matter for billing.",
      },
      {
        say: "We never received the letter. Can you send it again?",
        hear: "Re-sends it to the hospital's fax on file and tells you the last four digits.",
      },
    ],
    note: "Try it in Turkish: the agent answers in the language you speak.",
  },
  {
    id: "emergency",
    icon: "emergency",
    title: "Emergency",
    purpose: "Emergency first: 112, an urgent case, then the doctor on call",
    youPlay: "a traveller's partner at a hotel in Sultanahmet",
    turns: [
      {
        say: "Please help, my husband has chest pain and he's struggling to breathe. We're at our hotel in Sultanahmet.",
        hear: "Tells you to call 112 now, opens a critical case and connects you to the doctor on call with a summary.",
      },
    ],
    note: "Rings the on-call doctor's phone for real.",
  },
];
