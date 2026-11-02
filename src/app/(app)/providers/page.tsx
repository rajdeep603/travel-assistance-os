"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, GitMerge, LocateFixed, Search } from "lucide-react";
import { AIPipeline, usePipeline } from "@/components/ai-progress";
import { CaseContextBanner, useCaseContext } from "@/components/case-context";
import { useT } from "@/components/i18n";
import { ProviderMap } from "@/components/provider-map";
import { CareResultCard, type CareResultView } from "@/components/providers/care-result-card";
import { LocationInput, type PickedLocation } from "@/components/providers/location-input";
import { NeedPicker } from "@/components/providers/need-picker";
import { PriceLinkDialog } from "@/components/providers/price-link-dialog";
import { ValidateDialog } from "@/components/providers/validate-dialog";
import { Button, Card, EmptyState, ErrorBanner, PageHeader, SectionTitle, readApiError } from "@/components/ui";
import { useQueryParam } from "@/lib/client/use-query-param";
import { formatSlotDate } from "@/lib/format";
import { CARE_LOCATIONS } from "@/lib/services/provider-needs";
import { zonedToday } from "@/lib/time";

// ---------------------------------------------------------------------------
// Find care for a patient: where they are and what they need; providers
// within 2 km first, widening to 5, 10 and 25 km until there is a choice;
// open now, direct billing and language if asked; each with distance and
// driving minutes, rating, an estimate and why it is here; closed practices
// left out and every exclusion explained. Book a slot, validate the practice
// by phone (Ada rings it), or send it the price-list link.
// ---------------------------------------------------------------------------

interface SearchView {
  at: { lat: number; lng: number; label: string };
  need: { id: string; label: string; item: string | null };
  date: string;
  steps: { radiusKm: number; found: number }[];
  radiusKm: number;
  results: CareResultView[];
  excluded: { id: string; ref: string; name: string; facility: string; distanceKm: number; reason: string }[];
}

interface PatientOption {
  id: string;
  ref: string;
  firstName: string;
  lastName: string;
}

const LANGUAGES = ["", "English", "Turkish", "German", "French", "Arabic", "Russian", "Spanish", "Portuguese", "Italian", "Mandarin"];
const TRY_LOCATIONS = ["taksim", "four-seasons-sultanahmet", "wyndham-kalamis", "ist-airport", "marina-bay-sands"];
const SEARCH_STAGES = ["Placing the patient on the map", "Filtering the network for the need", "Checking who is open and reachable", "Ranking by distance, rating and price"];

const fieldClass = "rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink focus:border-brand focus:outline-none";
const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150 ${on ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand/40"}`;

export default function FindCarePage() {
  const t = useT();
  const defaultLocation = CARE_LOCATIONS[0];
  const [location, setLocation] = useState<PickedLocation>({ label: defaultLocation.label, lat: defaultLocation.lat, lng: defaultLocation.lng });
  const [need, setNeed] = useState("gp");
  const [openNow, setOpenNow] = useState(false);
  const [directBilling, setDirectBilling] = useState(false);
  const [language, setLanguage] = useState("");
  const [date, setDate] = useState(() => zonedToday(1));
  const [timeOfDay, setTimeOfDay] = useState("");
  const [data, setData] = useState<SearchView | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [validate, setValidate] = useState<CareResultView | null>(null);
  const [link, setLink] = useState<CareResultView | null>(null);
  const pipeline = usePipeline(searching && data == null, SEARCH_STAGES.length, { stepMs: 350, failed: !!error });
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Opened from a case (?caseId=): start where its patient is, book for that patient and link the appointment.
  const [detached, setDetached] = useState(false);
  const linkedCase = useCaseContext(useQueryParam("caseId"));
  const forCase = detached ? null : linkedCase;
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [booking, setBooking] = useState<{ result: CareResultView; slot: { date: string; time: string } } | null>(null);
  const [bookingPatient, setBookingPatient] = useState("");
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ text: string; caseRef: string | null } | null>(null);

  const runSearch = useCallback(
    async (opts: { refresh?: boolean; loc?: PickedLocation; need?: string } = {}) => {
      const loc = opts.loc ?? location;
      setSearching(true);
      setError(null);
      if (!opts.refresh) {
        setData(null);
        setConfirmation(null);
        setFocus(null);
      }
      try {
        const res = await fetch("/api/providers/find", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(loc.fromCase && forCase ? { caseId: forCase.id } : loc.lat != null && loc.lng != null ? { at: { lat: loc.lat, lng: loc.lng, label: loc.label } } : { location: loc.label }),
            need: opts.need ?? need,
            openNow,
            directBilling,
            language: language || undefined,
            date,
            timeOfDay: timeOfDay || undefined,
          }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "The search failed."));
          return;
        }
        const view = (await res.json()) as SearchView;
        setData(view);
        if (!opts.refresh) setFocus(view.results[0]?.provider.id ?? null);
      } catch {
        setError("The search failed — please check your connection.");
      } finally {
        setSearching(false);
      }
    },
    [location, need, openNow, directBilling, language, date, timeOfDay, forCase]
  );

  // Open with results; from a case, start where its patient is once the case is known.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    if (linkedCase === null && hasCaseIdParam()) return;
    started.current = true;
    if (linkedCase) {
      const loc = { label: `${linkedCase.ref} · ${linkedCase.title}`, fromCase: true };
      setLocation(loc);
      void runSearch({ loc });
    } else void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the case (if any) is known
  }, [linkedCase]);

  useEffect(() => {
    fetch("/api/patients")
      .then((r) => (r.ok ? r.json() : { patients: [] }))
      .then((b) => setPatients(b.patients ?? []))
      .catch(() => setPatients([]));
  }, []);

  useEffect(() => {
    if (!booking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBooking(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [booking]);

  function selectProvider(id: string) {
    setFocus(id);
    cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const patientForBooking = forCase?.patient.id ?? bookingPatient;

  async function book() {
    if (!booking || !patientForBooking) return;
    setBookingBusy(true);
    setBookingError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patientForBooking,
          providerId: booking.result.provider.id,
          date: booking.slot.date,
          time: booking.slot.time,
          reason: `${data?.need.label ?? booking.result.provider.specialty} via Find care`,
          ...(forCase ? { caseId: forCase.id } : {}),
        }),
      });
      if (!res.ok) {
        setBookingError(await readApiError(res, "The appointment could not be booked."));
        return;
      }
      const body = await res.json();
      setConfirmation({
        text: `Appointment ${body.appointment.ref} confirmed with ${booking.result.provider.name} at ${booking.result.provider.facility} on ${formatSlotDate(booking.slot.date)} at ${booking.slot.time}.`,
        caseRef: forCase?.ref ?? null,
      });
      setBooking(null);
      setBookingPatient("");
      void runSearch({ refresh: true });
    } catch {
      setBookingError("The appointment could not be booked — please try again.");
    } finally {
      setBookingBusy(false);
    }
  }

  const origin = data ? { lat: data.at.lat, lng: data.at.lng, label: data.at.label.replace(/ \(from the case\)$/, "") } : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Find care for a patient" subtitle="Where the patient is and what they need. Providers within 2 km first, widening to 5, 10 and 25 km until there is a choice; closed practices left out and every exclusion explained; each with distance, driving minutes, rating, an estimate and free slots.">
        <Link href="/providers/network" className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-canvas">
          <GitMerge size={15} aria-hidden /> {t("Provider network")}
        </Link>
      </PageHeader>
      {forCase ? <CaseContextBanner kase={forCase} action="Booking" onClear={() => setDetached(true)} /> : null}
      {error ? (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}
      {confirmation ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
          <CheckCircle2 size={16} aria-hidden />
          <span>
            {confirmation.text}
            {confirmation.caseRef ? (
              <>
                {" "}
                Linked to{" "}
                <Link href={`/cases/${confirmation.caseRef}`} className="font-semibold underline">
                  {confirmation.caseRef}
                </Link>
                .
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      <Card className="mb-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
          className="grid gap-3 md:grid-cols-[minmax(0,2fr)_auto] md:items-end"
        >
          <div className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Where the patient is</span>
            <LocationInput value={location.label} onChange={setLocation} fromCase={forCase ? { label: `${forCase.ref} · ${forCase.title}` } : null} disabled={searching} />
          </div>
          <Button type="submit" busy={searching} className="md:h-[38px]">
            <Search size={15} aria-hidden /> Search
          </Button>
        </form>
        <div className="mt-3">
          <span className="mb-1 block text-xs font-medium text-muted">What they need</span>
          <NeedPicker value={need} onChange={setNeed} disabled={searching} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-muted">Only:</span>
          <button type="button" onClick={() => setOpenNow(!openNow)} aria-pressed={openNow} className={chip(openNow)}>
            Open now
          </button>
          <button type="button" onClick={() => setDirectBilling(!directBilling)} aria-pressed={directBilling} className={chip(directBilling)}>
            Direct billing
          </button>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={fieldClass} aria-label="Language spoken">
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l || "Any language"}
              </option>
            ))}
          </select>
          <span className="ms-2 font-medium text-muted">Book on:</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} aria-label="Day to book" />
          <select value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className={fieldClass} aria-label="Time of day">
            <option value="">Any time</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
          </select>
          <span className="text-muted">The practice&apos;s own local time decides &ldquo;open now&rdquo;.</span>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <LocateFixed size={12} aria-hidden /> Try:
          {TRY_LOCATIONS.map((id) => CARE_LOCATIONS.find((l) => l.id === id)).map((l) =>
            l ? (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  const loc = { label: l.label, lat: l.lat, lng: l.lng };
                  setLocation(loc);
                  void runSearch({ loc });
                }}
                className="font-medium text-brand hover:underline"
              >
                {l.label}
              </button>
            ) : null
          )}
        </p>
      </Card>

      {pipeline.visible ? (
        <Card>
          <AIPipeline stages={SEARCH_STAGES} active={pipeline.active} />
        </Card>
      ) : data ? (
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-ink">
                {data.results.length} provider{data.results.length === 1 ? "" : "s"} for {data.need.label.toLowerCase()}
              </span>
              <span className="text-muted">near {data.at.label}</span>
            </div>
            {data.steps.length ? (
              <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Search radius">
                {data.steps.map((s, i) => (
                  <li key={s.radiusKm} className={`rounded-full border px-2.5 py-1 ${i === data.steps.length - 1 ? "border-brand bg-brand/10 font-semibold text-brand" : "border-line text-muted"}`}>
                    {s.radiusKm} km: {s.found === 0 ? "none" : s.found}
                    {i < data.steps.length - 1 ? " → widened" : ""}
                  </li>
                ))}
              </ol>
            ) : null}
            {data.results.length ? (
              data.results.map((r, i) => (
                <div
                  key={r.provider.id}
                  ref={(el) => {
                    cardRefs.current[r.provider.id] = el;
                  }}
                  className="animate-fade-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <CareResultCard
                    r={r}
                    rank={i + 1}
                    selected={focus === r.provider.id}
                    onFocus={() => setFocus(r.provider.id)}
                    onBook={(slot) => {
                      setBookingError(null);
                      setBooking({ result: r, slot });
                      setConfirmation(null);
                    }}
                    onValidate={() => setValidate(r)}
                    onLink={() => setLink(r)}
                  />
                </div>
              ))
            ) : (
              <Card>
                <EmptyState title="Nothing within 25 km answers this need" hint="Loosen a filter, try a broader need, or start from another place." />
              </Card>
            )}
            {data.excluded.length ? (
              <details className="group rounded-xl border border-line bg-canvas/60 text-xs">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {data.excluded.length} left out within {data.radiusKm} km, and why <ChevronDown size={14} className="ms-auto text-muted transition-transform duration-150 group-open:rotate-180" aria-hidden />
                </summary>
                <ul className="space-y-1 border-t border-line px-3 py-2 text-muted">
                  {data.excluded.map((e) => (
                    <li key={e.id}>
                      <Link href={`/providers/${e.ref}`} className="font-medium text-ink hover:text-brand">
                        {e.facility}
                      </Link>{" "}
                      · {e.distanceKm} km · {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          <div className="lg:col-span-2">
            <Card className="lg:sticky lg:top-20 lg:flex lg:h-[calc(100dvh-6rem)] lg:max-h-[46rem] lg:flex-col">
              <SectionTitle>Network map</SectionTitle>
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                <ProviderMap
                  className="lg:aspect-auto lg:flex-1"
                  providers={data.results
                    .filter((r) => r.provider.kind !== "TELEMEDICINE")
                    .map((r) => ({ id: r.provider.id, name: r.provider.name, facility: r.provider.facility, latitude: r.provider.latitude, longitude: r.provider.longitude }))}
                  origin={origin}
                  selectedId={focus}
                  onSelect={selectProvider}
                />
              </div>
              <p className="mt-2 text-xs text-muted">Pins are the ranked matches{origin ? ` around ${origin.label}` : ""}; rings are real distances. Click a pin to highlight the provider.</p>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <EmptyState title="Find care for a patient" hint="Pick where the patient is and what they need, then search." />
        </Card>
      )}

      {validate ? <ValidateDialog providerRef={validate.provider.ref} providerName={validate.provider.facility} phone={validate.provider.phone} onClose={() => setValidate(null)} onDone={() => void runSearch({ refresh: true })} /> : null}
      {link ? <PriceLinkDialog providerRef={link.provider.ref} providerName={link.provider.facility} phone={link.provider.phone} email={link.provider.email} onClose={() => setLink(null)} onDone={() => void runSearch({ refresh: true })} /> : null}

      {booking ? (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onClick={() => setBooking(null)}>
          <div role="dialog" aria-modal="true" aria-label="Book appointment" className="animate-modal-in w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <SectionTitle>Book appointment</SectionTitle>
            <p className="mt-2 text-sm text-ink">
              {booking.result.provider.name} · {booking.result.provider.facility}
              <br />
              <span className="font-semibold">
                {formatSlotDate(booking.slot.date)} at {booking.slot.time}
              </span>
            </p>
            {forCase ? (
              <p className="mt-4 rounded-lg bg-canvas px-3 py-2 text-sm text-ink">
                Patient:{" "}
                <span className="font-medium">
                  {forCase.patient.firstName} {forCase.patient.lastName}
                </span>{" "}
                ({forCase.patient.ref}) · case {forCase.ref}
              </p>
            ) : (
              <label className="mt-4 block">
                <span className="mb-1 block text-xs font-medium text-muted">Patient</span>
                <select value={bookingPatient} onChange={(e) => setBookingPatient(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none">
                  <option value="">Select patient…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName} ({p.ref})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {bookingError ? (
              <div className="mt-4">
                <ErrorBanner message={bookingError} />
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBooking(null)}>
                Cancel
              </Button>
              <Button onClick={() => void book()} busy={bookingBusy} disabled={!patientForBooking}>
                Confirm booking
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Whether the page was opened with ?caseId= (the case context then arrives a moment later). */
function hasCaseIdParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("caseId");
}
