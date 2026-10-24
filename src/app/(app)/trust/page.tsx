import type { ReactNode } from "react";
import { Ban, Cable, FileClock, Globe2, LayoutGrid, Lock, PhoneCall, UserRoundCheck } from "lucide-react";
import { T } from "@/components/i18n";
import { PageHeader } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Trust & integration: the answers procurement, compliance and IT ask for
// first. Every "today" line describes what this platform does now; anything
// that a pilot or the roadmap adds is labelled as such.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type Line = { text: ReactNode; when?: "pilot" | "roadmap" };

const WHEN_LABEL = { pilot: "In a pilot", roadmap: "On the roadmap" } as const;

function Block({ icon, title, intro, lines }: { icon: ReactNode; title: string; intro: string; lines: Line[] }) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        {icon}
        <T>{title}</T>
      </h2>
      <p className="mt-1 text-sm text-muted"><T>{intro}</T></p>
      <ul className="mt-3 space-y-2 text-sm text-ink">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span>
              {l.text}
              {l.when ? (
                <span className="ml-2 whitespace-nowrap rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">{WHEN_LABEL[l.when]}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function TrustPage() {
  const autoLimit = env.logAutoApproveLimitEur.toLocaleString("en-GB");
  const retention = env.callRetentionDays;
  const icon = (Icon: typeof Ban) => <Icon size={18} className="text-brand" aria-hidden />;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Trust & integration"
        subtitle={`How ${BRAND.name} keeps people in charge, what it records, and how it sits beside the systems you already run.`}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Block
          icon={icon(Ban)}
          title="What the AI never decides"
          intro="These stay with your people, whatever the AI has prepared."
          lines={[
            { text: "Medical advice, diagnosis or medication. Doctors give advice; the AI arranges care and puts emergencies through to the on-call doctor." },
            { text: "Whether a claim is paid. The AI checks the claim and says what's missing; the claims team decides." },
            {
              text: `A guarantee of payment that is above the automatic limit (EUR ${autoLimit}), over the remaining policy limit, outside the policy dates or with a possible pre-existing condition. These wait for a person, who can approve a lower amount.`,
            },
            { text: "Cutting a guarantee on price before treatment. Price findings are advice and a reserve; only lines the policy never covers are deducted." },
            { text: "Settling a hospital bill. Each bill review is accepted or waived by a person; on the phone, the negotiation agent agrees only within the limit the rules set." },
            { text: "Answering complaints or legal threats. Those are flagged and a reply is drafted for a person to approve." },
          ]}
        />

        <Block
          icon={icon(UserRoundCheck)}
          title="Where people stay in charge"
          intro="The AI does the preparation; every decision point has a place in the product."
          lines={[
            { text: "“Needs a person” on the overview lists every decision waiting, each opening the record to decide on." },
            { text: "Letters of Guarantee that need a person wait as drafts, with the reasons." },
            { text: "Inbox messages that need a person are flagged, with a reply drafted for approval." },
            { text: "Emergencies on a call open a critical case and are put through to the on-call doctor, who first hears the AI's summary." },
            { text: "Every agent's abilities, limits and handover rules are shown on the Voice Agents page." },
          ]}
        />

        <Block
          icon={icon(FileClock)}
          title="Every step on the record"
          intro="What happened, who or what did it, and why."
          lines={[
            { text: "The case timeline records every call, e-mail, fax, letter, booking and note, and whether an AI agent, a person or the system did it." },
            { text: "Each Letter of Guarantee keeps its decision trace: the estimate, the remaining limit, the excess and the rule applied." },
            { text: "Each call keeps its transcript, the tools the agent used and a summary of what it achieved." },
            { text: "Every e-mail and fax sent is recorded, with whether it went automatically or who approved it." },
            { text: "Exports of the audit trail to your own systems.", when: "roadmap" },
          ]}
        />

        <Block
          icon={icon(PhoneCall)}
          title="Callers know they're talking to AI"
          intro="Disclosure, recording and retention on calls."
          lines={[
            { text: "Every agent says it is an AI at the start of the call, in the caller's language." },
            { text: "Calls are transcribed; the audio itself isn't stored." },
            { text: `After ${retention} days, phone transcripts are erased and caller numbers masked; the call's outcome and the case stay for reporting.` },
            { text: "Agents never ask for passport, ID or card numbers, and only discuss a policy after the caller is verified." },
            { text: "Retention periods and recording consent wording set to your policy and each country's rules.", when: "pilot" },
          ]}
        />

        <Block
          icon={icon(Lock)}
          title="Data and hosting"
          intro="Where the data lives and who can reach it."
          lines={[
            { text: "This demonstration holds fictional records only. It runs in a cloud data centre over HTTPS, and every operator screen is behind a sign-in." },
            { text: "A visitor's own document can be deleted with everything read from it, straight after the meeting." },
            { text: "If an external AI service is slow or unavailable, documents and messages fall back to built-in rules, so the work doesn't stop." },
            { text: "Hosting in your region (see below) or on your own servers; the platform runs as containers.", when: "pilot" },
            { text: "A data-processing agreement for your country's law (GDPR, KVKK, POPIA, PDPL, LGPD, PIPEDA and Law 25, HIPAA), with the AI services chosen and agreed with you.", when: "pilot" },
            { text: "Our engineers in India have no access to your production data by default; support access is logged and only with your approval.", when: "pilot" },
            { text: "Single sign-on with your identity provider, and roles per team.", when: "roadmap" },
          ]}
        />

        <Block
          icon={icon(Cable)}
          title="How it fits your systems"
          intro="Start beside what you run today; no platform change for a pilot."
          lines={[
            { text: "Phone: point a number, or your switchboard's after-hours or overflow route, at the AI line. Transfers go back to your doctors and case managers." },
            { text: "E-mail and fax: forward a mailbox or fax line to the intake, which matches each message to its case." },
            { text: "WhatsApp: messages to your WhatsApp number go through the same intake and are answered on WhatsApp. Works with the Twilio sandbox today; your own number once WhatsApp approves your business sender.", when: "pilot" },
            { text: "Hospitals and correspondents: a receivables desk that checks invoices before they go out and chases payers by e-mail and by phone." },
            { text: "Partners: hand a case to a correspondent with a secure link; their updates arrive on the case timeline." },
            { text: "Letters and replies go out by e-mail or fax, as PDFs your team can file anywhere." },
            { text: "Your rules are data, not code: policy benefits, the automatic approval limit, the tariff and the knowledge articles." },
            { text: "Sending from your own addresses, with your rules loaded per insurer client.", when: "pilot" },
            { text: "A documented API (v1, with API keys) and signed webhooks to your case system: case created, guarantee issued, claim settled, call completed, payment recorded. See Developers." },
            { text: "SIP connector: your contact centre (Genesys Cloud BYOC, Avaya, Cisco, a PBX) sends overflow or after-hours calls to the AI over SIP, with the case reference and language in SIP headers; transfers go back to your queue's SIP address. Set up with your telephony team in a pilot.", when: "pilot" },
          ]}
        />
      </div>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          {icon(Globe2)} <T>Where your data can live</T>
        </h2>
        <p className="mt-1 text-sm text-muted">
          The law your procurement team will ask about, and how a pilot is set up for it. Hosting and agreements are arranged per client in the pilot; this is a guide, not legal advice.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium text-muted">
                <th className="py-2 pr-4">Where</th>
                <th className="py-2 pr-4">Law</th>
                <th className="py-2 pr-4">Hosting in a pilot</th>
                <th className="py-2">What we sign or do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 align-top">
              {DATA_LOCATIONS.map((r) => (
                <tr key={r.where}>
                  <td className="py-2.5 pr-4 font-medium text-ink">{r.where}</td>
                  <td className="py-2.5 pr-4 text-ink/85">{r.law}</td>
                  <td className="py-2.5 pr-4 text-ink/85">{r.hosting}</td>
                  <td className="py-2.5 text-ink/85">{r.terms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          {icon(LayoutGrid)} <T>Products: time to go live, pricing and security</T>
        </h2>
        <p className="mt-1 text-sm text-muted">
          Each one can be piloted on its own, beside your systems. Prices come from the quotation (Business Case → Generate quotation), sized to your volumes.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium text-muted">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Live in</th>
                <th className="py-2 pr-4">Pricing model</th>
                <th className="py-2 pr-4">Security in the technology</th>
                <th className="py-2">Security in operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 align-top">
              {PRODUCTS.map((r) => (
                <tr key={r.product}>
                  <td className="py-2.5 pr-4 font-medium text-ink">{r.product}</td>
                  <td className="py-2.5 pr-4 text-ink/85">{r.live}</td>
                  <td className="py-2.5 pr-4 text-ink/85">{r.pricing}</td>
                  <td className="py-2.5 pr-4 text-ink/85">{r.tech}</td>
                  <td className="py-2.5 text-ink/85">{r.ops}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Common to all: HTTPS everywhere, sign-in on every operator screen, secrets kept out of the code, fictional data in this demonstration. Single sign-on and per-team roles are on the roadmap.
        </p>
      </section>
    </div>
  );
}

/** Data protection by region: the law, the hosting a pilot uses, and the agreement. A guide, not legal advice. */
const DATA_LOCATIONS: { where: string; law: string; hosting: string; terms: string }[] = [
  { where: "European Union", law: "GDPR", hosting: "EU cloud region (Frankfurt)", terms: "Data-processing agreement; AI services with EU processing; standard contractual clauses for any transfer" },
  { where: "Switzerland", law: "Federal Act on Data Protection (revFADP)", hosting: "Swiss region (Zurich)", terms: "Data-processing agreement; medical secrecy respected by keeping data in Switzerland" },
  { where: "United Kingdom", law: "UK GDPR", hosting: "UK region (London) or EU", terms: "Data-processing agreement with the UK addendum" },
  { where: "Türkiye", law: "KVKK", hosting: "In-country data centre, or EU with KVKK standard contracts", terms: "Standard contracts notified to the KVKK board when data leaves Türkiye" },
  { where: "United Arab Emirates", law: "PDPL; health data law 2/2019", hosting: "UAE region (health data stays in the UAE)", terms: "Data-processing agreement; in-country hosting for health records" },
  { where: "Egypt", law: "Personal Data Protection Law 151/2020 and its 2025 regulations", hosting: "Gulf or EU region, as the licence allows", terms: "Data-processing agreement; the licence and local representative the regulations require" },
  { where: "Tunisia", law: "Law 2004-63", hosting: "EU region", terms: "The data authority's (INPDP) prior authorisation for health data and transfers, prepared with you" },
  { where: "South Africa", law: "POPIA (health data is special personal information)", hosting: "South Africa region (Cape Town)", terms: "Operator agreement; no cross-border transfer without section 72 grounds" },
  { where: "Canada", law: "PIPEDA; Quebec Law 25", hosting: "Canada region", terms: "Privacy impact assessment before any transfer; French-language notices for Quebec" },
  { where: "United States", law: "HIPAA", hosting: "US region", terms: "Business associate agreement" },
  { where: "Brazil", law: "LGPD", hosting: "Brazil region (São Paulo)", terms: "Data-processing agreement; health data handled as sensitive" },
  { where: "Mexico", law: "Federal personal data protection law (2025)", hosting: "Mexico or US region", terms: "Data-processing agreement and privacy notice" },
  { where: "Dominican Republic", law: "Law 172-13", hosting: "US or EU region", terms: "Data-processing agreement" },
  { where: "Albania and the Western Balkans", law: "Law 124/2024 (aligned with GDPR)", hosting: "EU region", terms: "Data-processing agreement" },
  { where: "Singapore and Asia-Pacific", law: "PDPA", hosting: "Singapore region", terms: "Data-processing agreement" },
];

/** The products on the grid buyers ask for: how fast each goes live, how it's priced and how it's kept safe. */
const PRODUCTS: { product: string; live: string; pricing: string; tech: string; ops: string }[] = [
  { product: "AI voice agents", live: "About 3 weeks to a pilot on one call flow", pricing: "Monthly, by call minutes, plus the phone line", tech: "Says it's an AI; never asks for ID or card numbers; policy details only after verification", ops: "Emergencies to your on-call doctor; transcripts erased after the retention period" },
  { product: "CareTrack case management", live: "Configured to your workflow; migration planned with you", pricing: "Monthly subscription; setup and migration quoted separately", tech: "Every action on the case timeline, by person, AI or system", ops: "Roles per team (roadmap); four-eyes approval above limits" },
  { product: "E-mail, fax and WhatsApp automation", live: "Days: forward a mailbox, fax line or WhatsApp number", pricing: "Monthly, by messages read", tech: "Attachments read and filed on the right case; risky messages held", ops: "Complaints and legal threats always go to a person" },
  { product: "Medical Document AI", live: "Days", pricing: "Monthly, by documents read", tech: "Sample and test files stay on built-in rules; a visitor's file can be erased with everything read from it", ops: "A person checks low-confidence extractions" },
  { product: "Claims automation (triage, entry, adjudication)", live: "About 3 weeks with your policy rules and tariff", pricing: "Monthly, by claims reviewed", tech: "Amounts set by rules with a reason per line, never by the AI; EOB issued on approval", ops: "Every settlement approved by a person; integrity signals kept internal" },
  { product: "AI interpreter", live: "Days", pricing: "By call minutes", tech: "Captions for both sides; transcript on the case", ops: "The case manager leads the call" },
  { product: "Provider network management", live: "Days: import your network", pricing: "Included with case management", tech: "Duplicates merged with an audit trail and undo; accreditation and network rates on each provider", ops: "Merges and rate changes by named people" },
  { product: "Receivables desk (hospitals, correspondents)", live: "Days", pricing: "Monthly, by invoices followed", tech: "Payer-ready check before an invoice leaves; follow-up calls never agree discounts", ops: "Disputes go to the billing manager" },
  { product: "Partner hand-off and oversight", live: "Days per partner", pricing: "Included with case management", tech: "Secure links per hand-off; scores computed from records, not self-reported", ops: "Partners see only the case pack they were sent" },
  { product: "API and webhooks", live: "Keys the same day", pricing: "Included", tech: "API keys; webhooks signed with HMAC-SHA256", ops: "Keys revoked by removing them; every delivery logged" },
  { product: "SIP connector (contact centres)", live: "About a week with your telephony team", pricing: "Included; call minutes as for voice agents", tech: "Calls over SIP from your trunk or contact centre; case and language passed in SIP headers", ops: "Transfers back to your own queues; nothing changes for your agents" },
];
