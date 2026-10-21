"use client";

import { useId, useState, type FormEvent } from "react";
import { CheckCircle2, FileSearch, Headset, ReceiptText, Send } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { VoiceOrb } from "@/components/voice/voice-orb";
import { readApiError } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { LEAD_PAINS, LEAD_SEGMENTS } from "@/lib/meeting-notes";

// What a visitor sees on their own phone at the booth: what CareTrail does in
// three lines, and a short form. Their details land in Leads for the
// presenter to follow up the same evening.

const PROOF = [
  { icon: Headset, tone: "bg-live/20 text-live", title: "Every call answered in seconds", text: "Day and night, in the caller's language. Emergencies go straight to your doctor." },
  { icon: FileSearch, tone: "bg-brand-2/20 text-brand-2", title: "Paperwork that reads itself", text: "E-mails, faxes and medical reports matched to the case; guarantees of payment drafted in minutes." },
  { icon: ReceiptText, tone: "bg-brand/25 text-sky-300", title: "Hospital bills checked line by line", text: "Overcharges found before anything is paid. Your people make every decision." },
] as const;

const FIELD =
  "mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base text-ink placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";
const LABEL = "block text-sm font-medium text-ink";

interface Form {
  name: string;
  company: string;
  email: string;
  phone: string;
  role: string;
  segment: string;
  pains: string[];
  message: string;
  consent: boolean;
  website: string;
}

const EMPTY: Form = { name: "", company: "", email: "", phone: "", role: "", segment: "", pains: [], message: "", consent: false, website: "" };

export default function MeetPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; email: string } | null>(null);
  const ids = { name: useId(), company: useId(), email: useId(), phone: useId(), role: useId(), segment: useId(), message: useId(), consent: useId() };

  const set = (change: Partial<Form>) => setForm((f) => ({ ...f, ...change }));
  const togglePain = (id: string) => set({ pains: form.pains.includes(id) ? form.pains.filter((p) => p !== id) : [...form.pains, id] });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.consent) {
      setError("Please tick the box so we may contact you.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, segment: form.segment || null }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Your details couldn't be sent. Please try again, or ask us at the booth."));
      const { lead } = (await res.json()) as { lead: { customerName: string; email: string } };
      setDone({ name: lead.customerName, email: lead.email });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^[a-z]+: /i, "") : "Your details couldn't be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="flex items-center gap-2.5">
        <BrandMark size={34} />
        <div>
          <p className="text-lg font-semibold leading-tight tracking-tight text-white">{BRAND.name}</p>
          <p className="text-xs text-stage-muted">{BRAND.tagline}</p>
        </div>
      </header>

      <section className="mt-6 text-center">
        <VoiceOrb state="idle" size={132} className="mx-auto" />
        <h1 className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-white">
          AI that answers the calls, reads the paperwork and checks the bills.
        </h1>
        <p className="mt-2 text-base text-stage-muted">Your team keeps every decision.</p>
      </section>

      <ul className="mt-7 space-y-3">
        {PROOF.map(({ icon: Icon, tone, title, text }) => (
          <li key={title} className="flex gap-3 rounded-2xl bg-stage-raised/80 p-4 ring-1 ring-stage-line">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon size={19} aria-hidden />
            </span>
            <div>
              <p className="font-semibold text-white">{title}</p>
              <p className="mt-0.5 text-sm leading-snug text-stage-muted">{text}</p>
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-7 rounded-3xl bg-surface p-5 text-ink shadow-2xl shadow-black/30 sm:p-6" aria-live="polite">
        {done ? (
          <div className="animate-fade-up text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand bg-brand-gradient text-white shadow-glow">
              <CheckCircle2 size={28} aria-hidden />
            </span>
            <h2 className="mt-4 text-xl font-semibold tracking-tight">Thank you, {done.name.split(" ")[0]}.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              We&apos;ll send a short recap to <span className="font-medium text-ink">{done.email}</span> and be in touch within a day. Ask us at the booth for a two-minute live
              call with the voice agent in your language.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 className="text-xl font-semibold tracking-tight">Get a recap and a quotation for your numbers</h2>
            <p className="mt-1 text-sm text-muted">Leave your details and we&apos;ll follow up after the show. No newsletter, no spam.</p>

            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor={ids.name} className={LABEL}>
                  Your name
                  <input id={ids.name} autoComplete="name" required value={form.name} onChange={(e) => set({ name: e.target.value })} className={FIELD} />
                </label>
                <label htmlFor={ids.company} className={LABEL}>
                  Company
                  <input id={ids.company} autoComplete="organization" required value={form.company} onChange={(e) => set({ company: e.target.value })} className={FIELD} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor={ids.email} className={LABEL}>
                  Work e-mail
                  <input id={ids.email} type="email" inputMode="email" autoComplete="email" required value={form.email} onChange={(e) => set({ email: e.target.value })} className={FIELD} />
                </label>
                <label htmlFor={ids.phone} className={LABEL}>
                  Phone <span className="font-normal text-muted">(optional)</span>
                  <input id={ids.phone} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={FIELD} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor={ids.role} className={LABEL}>
                  Your role <span className="font-normal text-muted">(optional)</span>
                  <input id={ids.role} autoComplete="organization-title" value={form.role} onChange={(e) => set({ role: e.target.value })} placeholder="e.g. Head of Operations" className={FIELD} />
                </label>
                <label htmlFor={ids.segment} className={LABEL}>
                  Your organisation
                  <select id={ids.segment} value={form.segment} onChange={(e) => set({ segment: e.target.value })} className={FIELD}>
                    <option value="">Choose one…</option>
                    {LEAD_SEGMENTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset>
                <legend className={LABEL}>What would you solve first?</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LEAD_PAINS.map((p) => {
                    const on = form.pains.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => togglePain(p.id)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150 ${
                          on ? "border-transparent bg-brand bg-brand-gradient text-white shadow-glow" : "border-line bg-surface text-ink hover:border-brand/40"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label htmlFor={ids.message} className={LABEL}>
                Anything else? <span className="font-normal text-muted">(optional)</span>
                <textarea id={ids.message} rows={3} maxLength={600} value={form.message} onChange={(e) => set({ message: e.target.value })} placeholder="Volumes, languages, systems you use…" className={FIELD} />
              </label>

              {/* Honeypot: hidden from people, filled by bots. */}
              <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set({ website: e.target.value })} />
                </label>
              </div>

              <label htmlFor={ids.consent} className="flex items-start gap-3 text-sm text-muted">
                <input
                  id={ids.consent}
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => set({ consent: e.target.checked })}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-line accent-brand"
                />
                <span>
                  {BRAND.poweredBy} may contact me about {BRAND.name}. My details are used for this follow-up only.
                </span>
              </label>

              {error ? (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand bg-brand-gradient px-4 py-3.5 text-base font-semibold text-white shadow-glow transition-[filter,transform] duration-150 hover:brightness-[1.07] active:scale-[0.99] disabled:opacity-60"
              >
                <Send size={17} aria-hidden />
                {busy ? "Sending…" : "Send me the recap"}
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
