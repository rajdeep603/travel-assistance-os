"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MapPin, Phone, Search, Star } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  SectionTitle,
  readApiError,
} from "@/components/ui";
import { AIPipeline } from "@/components/ai-progress";
import { ProviderMap } from "@/components/provider-map";
import { formatSlotDate } from "@/lib/format";
import { ISTANBUL_DISTRICTS } from "@/lib/services/nlu";

interface ProviderResult {
  provider: {
    id: string;
    name: string;
    facility: string;
    specialty: string;
    district: string;
    city: string;
    languages: string[];
    phone: string;
    email: string;
    rating: number;
    latitude: number;
    longitude: number;
  };
  distanceKm: number | null;
  slots: { date: string; time: string }[];
  reasons: string[];
  score: number;
}

interface PatientOption {
  id: string;
  ref: string;
  firstName: string;
  lastName: string;
}

const SPECIALTIES = [
  "General Medicine", "Cardiology", "Gastroenterology", "Orthopedics",
  "Dentistry", "Dermatology", "Neurology", "Emergency Medicine",
  "Obstetrics & Gynecology", "Ophthalmology", "Ear, Nose & Throat", "Pediatrics",
];
const DISTRICTS = [
  "Taksim", "Beyoglu", "Sisli", "Besiktas", "Kadikoy", "Uskudar",
  "Fatih", "Sultanahmet", "Levent", "Bakirkoy", "Nisantasi", "Atasehir",
];
const LANGUAGES = ["English", "German", "French", "Russian", "Arabic", "Spanish", "Turkish"];

/** Theoretical maximum of the ranking score — used to show a match %. */
const MAX_SCORE = 110;

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ProvidersPage() {
  const [form, setForm] = useState({
    city: "Istanbul",
    district: "Taksim",
    specialty: "General Medicine",
    date: tomorrow(),
    timeOfDay: "afternoon",
    language: "English",
  });
  const [results, setResults] = useState<ProviderResult[] | null>(null);
  const [searchedDistrict, setSearchedDistrict] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [booking, setBooking] = useState<{
    result: ProviderResult;
    slot: { date: string; time: string };
  } | null>(null);
  const [bookingPatient, setBookingPatient] = useState("");
  const [bookingBusy, setBookingBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch("/api/patients")
      .then((r) => (r.ok ? r.json() : { patients: [] }))
      .then((b) => setPatients(b.patients ?? []))
      .catch(() => setPatients([]));
  }, []);

  // Close the booking dialog with Escape.
  useEffect(() => {
    if (!booking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBooking(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [booking]);

  async function search() {
    setSearching(true);
    setError(null);
    setResults(null);
    setConfirmation(null);
    setSelectedId(null);
    try {
      const res = await fetch("/api/providers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, limit: 5 }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The provider search failed."));
        return;
      }
      const list: ProviderResult[] = (await res.json()).results ?? [];
      setResults(list);
      setSearchedDistrict(form.city === "Istanbul" ? form.district || null : null);
      setSelectedId(list[0]?.provider.id ?? null);
    } catch {
      setError("The provider search failed — please check your connection.");
    } finally {
      setSearching(false);
    }
  }

  function selectProvider(id: string) {
    setSelectedId(id);
    cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function book() {
    if (!booking || !bookingPatient) return;
    setBookingBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: bookingPatient,
          providerId: booking.result.provider.id,
          date: booking.slot.date,
          time: booking.slot.time,
          reason: `${form.specialty} appointment via Provider Search`,
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The appointment could not be booked."));
        return;
      }
      const body = await res.json();
      setConfirmation(
        `Appointment ${body.appointment.ref} confirmed with ${booking.result.provider.name} on ${formatSlotDate(booking.slot.date)} at ${booking.slot.time}.`
      );
      setBooking(null);
      setBookingPatient("");
    } catch {
      setError("The appointment could not be booked — please try again.");
    } finally {
      setBookingBusy(false);
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const selectCls =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition-shadow focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

  const originCoords =
    searchedDistrict != null
      ? ISTANBUL_DISTRICTS[searchedDistrict.toLowerCase()] ?? null
      : null;
  const origin =
    originCoords && searchedDistrict
      ? { ...originCoords, label: searchedDistrict }
      : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Provider Search"
        subtitle="Find suitable healthcare providers in the demo network — matched on specialty, language, availability and distance."
      />
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}
      {confirmation ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} aria-hidden />
          {confirmation}
        </div>
      ) : null}

      <Card className="mb-5">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">City</span>
            <select
              value={form.city}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  city: e.target.value,
                  district: e.target.value === "Istanbul" ? f.district : "",
                }))
              }
              className={selectCls}
            >
              {["Istanbul", "Ankara", "Antalya"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">District</span>
            <select
              value={form.district}
              onChange={set("district")}
              className={selectCls}
              disabled={form.city !== "Istanbul"}
            >
              <option value="">Any</option>
              {form.city === "Istanbul"
                ? DISTRICTS.map((d) => <option key={d}>{d}</option>)
                : null}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Specialty</span>
            <select value={form.specialty} onChange={set("specialty")} className={selectCls}>
              {SPECIALTIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Date</span>
            <input type="date" value={form.date} onChange={set("date")} className={selectCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Time</span>
            <select value={form.timeOfDay} onChange={set("timeOfDay")} className={selectCls}>
              <option value="">Any</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Language</span>
            <select value={form.language} onChange={set("language")} className={selectCls}>
              <option value="">Any</option>
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={search} busy={searching}>
            <Search size={15} aria-hidden />
            Search providers
          </Button>
          {form.city !== "Istanbul" ? (
            <p className="text-xs text-slate-400">
              The demo network is Istanbul-focused — other cities have limited coverage.
            </p>
          ) : null}
        </div>
      </Card>

      {searching ? (
        <Card>
          <AIPipeline
            busy={searching}
            stages={[
              "Filtering the provider network",
              "Checking live availability",
              "Scoring distance, language and rating",
              "Ranking the best matches",
            ]}
            stepMs={400}
          />
        </Card>
      ) : results == null ? (
        <Card>
          <EmptyState
            title="Search the provider network"
            hint="The form is prefilled with the ITIC demo scenario — Istanbul, General Medicine, tomorrow afternoon, English."
          />
        </Card>
      ) : results.length === 0 ? (
        <Card>
          <EmptyState
            title="No providers match this search"
            hint="Try another day, district or specialty — or remove the language filter."
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Card className="lg:sticky lg:top-20">
              <SectionTitle>Network map</SectionTitle>
              <div className="mt-3">
                <ProviderMap
                  providers={results.map((r) => ({
                    id: r.provider.id,
                    name: r.provider.name,
                    facility: r.provider.facility,
                    latitude: r.provider.latitude,
                    longitude: r.provider.longitude,
                  }))}
                  origin={origin}
                  selectedId={selectedId}
                  onSelect={selectProvider}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Pins are ranked matches{origin ? ` around ${origin.label}` : ""} —
                click a pin to highlight the provider.
              </p>
            </Card>
          </div>

          <div className="space-y-4 lg:col-span-3">
            {results.map((r, i) => {
              const selected = r.provider.id === selectedId;
              const matchPct = Math.min(99, Math.round((r.score / MAX_SCORE) * 100));
              return (
                <div
                  key={r.provider.id}
                  ref={(el) => {
                    cardRefs.current[r.provider.id] = el;
                  }}
                >
                  <Card
                    className={`animate-fade-up cursor-pointer transition-all ${
                      selected ? "border-blue-400 ring-2 ring-blue-100" : "hover:-translate-y-0.5"
                    }`}
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <div onClick={() => setSelectedId(r.provider.id)}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-base font-semibold text-slate-900">
                              {r.provider.name}
                              <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-amber-500">
                                <Star size={12} fill="currentColor" aria-hidden /> {r.provider.rating.toFixed(1)}
                              </span>
                            </h3>
                            <p className="text-sm text-slate-500">
                              {r.provider.facility} · {r.provider.specialty}
                            </p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <MapPin size={12} aria-hidden />
                                {r.provider.district}, {r.provider.city}
                                {r.distanceKm != null ? ` · ${r.distanceKm} km` : ""}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Phone size={12} aria-hidden /> {r.provider.phone}
                              </span>
                              <span>Languages: {r.provider.languages.join(", ")}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                            title="AI match score against this search"
                          >
                            {matchPct}% match
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Available slots · {formatSlotDate(form.date)}
                          </p>
                          {r.slots.length === 0 ? (
                            <p className="text-xs text-slate-400">No slots on this date</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {r.slots.slice(0, 4).map((s) => (
                                <button
                                  key={`${s.date}-${s.time}`}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBooking({ result: r, slot: s });
                                    setConfirmation(null);
                                  }}
                                  className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                                >
                                  {s.time}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Why this provider?
                        </p>
                        <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                          {r.reasons.map((reason) => (
                            <li
                              key={reason}
                              className="flex items-center gap-1.5 text-xs text-slate-600"
                            >
                              <CheckCircle2 size={13} className="text-emerald-500" aria-hidden />
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {booking ? (
        <div
          className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          onClick={() => setBooking(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Book appointment"
            className="animate-modal-in w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <SectionTitle>Book appointment</SectionTitle>
            <p className="mt-2 text-sm text-slate-700">
              {booking.result.provider.name} · {booking.result.provider.facility}
              <br />
              <span className="font-semibold">
                {formatSlotDate(booking.slot.date)} at {booking.slot.time}
              </span>
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Patient
              </span>
              <select
                value={bookingPatient}
                onChange={(e) => setBookingPatient(e.target.value)}
                className={selectCls}
              >
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} ({p.ref})
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBooking(null)}>
                Cancel
              </Button>
              <Button onClick={book} busy={bookingBusy} disabled={!bookingPatient}>
                Confirm booking
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
