import type { ReactNode } from "react";
import { Ban, Cable, FileClock, Lock, PhoneCall, UserRoundCheck } from "lucide-react";
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
    <section className="flex flex-col rounded-2xl border border-line/80 bg-surface p-5 shadow-sm md:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        {icon}
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted">{intro}</p>
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
            { text: "Hosting in your region (EU, Türkiye, Gulf, Singapore) or on your own servers; the platform runs as containers.", when: "pilot" },
            { text: "A data-processing agreement covering GDPR, KVKK and PDPA, with the AI services chosen and agreed with you.", when: "pilot" },
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
            { text: "Letters and replies go out by e-mail or fax, as PDFs your team can file anywhere." },
            { text: "Your rules are data, not code: policy benefits, the automatic approval limit, the tariff and the knowledge articles." },
            { text: "Sending from your own addresses, with your rules loaded per insurer client.", when: "pilot" },
            { text: "A documented API and webhooks to your case system (case updated, guarantee issued, call completed).", when: "roadmap" },
            { text: "A direct SIP connection to your telephony platform.", when: "roadmap" },
          ]}
        />
      </div>
    </div>
  );
}
