import Link from "next/link";
import { CalendarCheck2, CheckCircle2, CircleAlert, FolderKanban, Loader2, Wrench } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import { formatSlotDate } from "@/lib/format";
import type { Booking, ProviderOption, ToolActivity } from "@/lib/voice/client/use-grok-voice";

const TOOL_LABELS: Record<string, string> = {
  search_providers: "Searching the provider network",
  book_appointment: "Booking the appointment",
  create_case: "Opening an assistance case",
  add_case_note: "Adding a note to the case",
  get_case_status: "Looking up the case",
  get_claim_status: "Looking up the claim",
  search_knowledge: "Checking the knowledge base",
  transfer_to_human: "Handing over to a person",
  end_call: "Ending the call",
};

/** What the agent is doing behind the scenes — the "visible AI". */
export function ActivityPanel({ tools }: { tools: ToolActivity[] }) {
  return (
    <Card>
      <SectionTitle>Agent activity</SectionTitle>
      {tools.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Tool calls the agent makes — searches, bookings, case updates — appear here.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {tools.map((t, i) => (
            <li key={`${t.name}-${i}`} className="flex items-start gap-2 text-sm text-slate-700">
              {t.status === "running" ? (
                <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-blue-500 motion-reduce:animate-none" aria-hidden />
              ) : t.status === "error" ? (
                <CircleAlert size={15} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
              ) : (
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
              )}
              <span>
                {TOOL_LABELS[t.name] ?? t.name}
                {t.status === "error" && t.summary ? <span className="block text-xs text-amber-700">{t.summary}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Wrench size={11} aria-hidden /> Real tools against the platform&apos;s live database.
      </p>
    </Card>
  );
}

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
              className="animate-fade-up w-full rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <p className="text-sm font-semibold text-slate-800">
                {o.option}. {o.doctor}
              </p>
              <p className="text-xs text-slate-500">
                {o.specialty} · {o.facility}, {o.district}
                {o.distance_km != null ? ` (${o.distance_km} km)` : ""}
              </p>
              <p className="mt-1 text-xs font-semibold text-blue-600">{o.slots.join(" · ")}</p>
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
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Confirmed</span>
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
