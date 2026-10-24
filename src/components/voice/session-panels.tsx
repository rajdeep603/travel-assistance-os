import Link from "next/link";
import { BadgeCheck, CalendarCheck2, FileCheck2, FolderKanban, Plane, ReceiptText, ShieldCheck } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import { formatSlotDate } from "@/lib/format";
import type { AgentResult, Booking, ProviderOption } from "@/lib/voice/client/use-grok-voice";

export function ProvidersPanel({
  providers,
  onPick,
  disabled,
}: {
  providers: { date: string; location: string; options: ProviderOption[] } | null;
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <SectionTitle>Provider options</SectionTitle>
      {providers && providers.options.length > 0 ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-slate-500">
            Near {providers.location} · {formatSlotDate(providers.date)}
          </p>
          {providers.options.map((o, i) => (
            <button
              key={o.provider_id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(`I'd like option ${o.option}, ${o.doctor}.`)}
              className="animate-fade-up w-full rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-brand/60 disabled:opacity-60"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <p className="text-sm font-semibold text-slate-800">
                {o.option}. {o.doctor}
              </p>
              <p className="text-xs text-slate-500">
                {o.specialty} · {o.facility}, {o.district}
                {o.distance_km != null ? ` (${o.distance_km} km)` : ""}
              </p>
              <p className="mt-1 text-xs font-semibold text-brand">{o.slots.join(" · ")}</p>
            </button>
          ))}
          <p className="text-[11px] text-slate-500">Say “option one” — or click an option.</p>
        </div>
      ) : providers ? (
        <p className="mt-2 text-xs text-slate-500">No free slots for that search — the agent will suggest another time.</p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Matching providers appear here after the agent searches.</p>
      )}
    </Card>
  );
}

export function BookingPanel({ booking, caseRef }: { booking: Booking | null; caseRef: { id: string; ref: string } | null }) {
  return (
    <>
      <Card>
        <SectionTitle>Appointment</SectionTitle>
        {booking ? (
          <div className="animate-fade-up mt-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <CalendarCheck2 size={16} className="text-emerald-500" aria-hidden />
              {booking.appointment.ref}
              <span className="animate-pop-in inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
                  <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-draw" style={{ ["--dash" as string]: 12, animationDelay: "0.2s" }} />
                </svg>
                Confirmed
              </span>
            </p>
            <p className="mt-1.5 text-sm text-slate-700">
              {booking.appointment.doctor} · {booking.appointment.specialty}
            </p>
            <p className="text-xs text-slate-500">
              {formatSlotDate(booking.appointment.date)} at {booking.appointment.time} · {booking.appointment.facility}, {booking.appointment.district}
            </p>
            <p className="mt-1 text-xs text-slate-500">Patient: {booking.patient.name} ({booking.patient.ref})</p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">The confirmed appointment appears here after booking.</p>
        )}
      </Card>
      <Card>
        <SectionTitle>Case</SectionTitle>
        {caseRef ? (
          <p className="animate-fade-up mt-2 flex items-center gap-2">
            <FolderKanban size={16} className="text-blue-500" aria-hidden />
            <Link href={`/cases/${caseRef.id}`} className="text-sm font-semibold text-blue-600 hover:underline">
              {caseRef.ref}
            </Link>
            <span className="text-xs text-slate-500">— transcript and summary filed here</span>
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">The assistance case appears here once created.</p>
        )}
      </Card>
    </>
  );
}

const RESULT_ICONS: Record<string, typeof BadgeCheck> = {
  coverage: ShieldCheck,
  guarantee: FileCheck2,
  money: ReceiptText,
  transport: Plane,
  update: BadgeCheck,
};

/** What the agent recorded during the session, and the case it went to. */
export function ResultsPanel({ results, caseRef }: { results: AgentResult[]; caseRef: { id: string; ref: string } | null }) {
  return (
    <Card className="md:col-span-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>What the agent recorded</SectionTitle>
        {caseRef ? (
          <Link href={`/cases/${caseRef.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
            <FolderKanban size={15} aria-hidden /> {caseRef.ref}
          </Link>
        ) : null}
      </div>
      {results.length ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {results.map((r) => {
            const Icon = RESULT_ICONS[r.kind] ?? BadgeCheck;
            return (
              <li key={r.id} className="animate-fade-up flex min-w-0 items-start gap-2.5 rounded-lg border border-line px-3 py-2">
                <Icon size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{r.title}</span>
                  {r.detail ? <span className="block text-xs text-muted">{r.detail}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Everything the agent saves (guarantees found, bills agreed, transport plans, hospital updates) appears here and on the case timeline.
        </p>
      )}
    </Card>
  );
}
