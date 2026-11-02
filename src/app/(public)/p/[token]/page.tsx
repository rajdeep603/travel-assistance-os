"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, FileUp } from "lucide-react";
import { Button, ErrorBanner, readApiError } from "@/components/ui";

// ---------------------------------------------------------------------------
// What a practice sees when it opens its price-list link, on a phone most
// likely: who is asking (CareTrail's provider network), the details we have
// (confirm or correct), prices typed in, and/or a price list to upload that
// the AI reads. Public, by token; the (public) layout carries the brand.
// ---------------------------------------------------------------------------

interface Info {
  client: { name: string; about: string; poweredBy: string };
  provider: { ref: string; facility: string; name: string; specialty: string; address: string; district: string; city: string; phone: string | null; email: string | null; hours: string | null; acceptsDirectBilling: boolean | null; languages: string[] };
  items: { id: string; label: string }[];
  submittedAt: string | null;
}

const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30";
const label = "mb-1 block text-xs font-medium text-muted";

export default function ProviderLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState("EUR");
  const [hours, setHours] = useState("");
  const [billing, setBilling] = useState<"yes" | "no" | "">("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ prices: number; extracted: number; note: string | null } | null>(null);

  useEffect(() => {
    fetch(`/api/public/provider-link/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: Info | null) => {
        if (!b) {
          setMissing(true);
          return;
        }
        setInfo(b);
        setHours(b.provider.hours ?? "");
        setBilling(b.provider.acceptsDirectBilling == null ? "" : b.provider.acceptsDirectBilling ? "yes" : "no");
        setEmail(b.provider.email ?? "");
      })
      .catch(() => setMissing(true));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append(
        "submission",
        JSON.stringify({
          confirmed: true,
          hours: hours || undefined,
          acceptsDirectBilling: billing === "" ? null : billing === "yes",
          email: email || undefined,
          contactName: contact || undefined,
          notes: notes || undefined,
          currency,
          prices: info.items.filter((i) => prices[i.id] && Number(prices[i.id]) > 0).map((i) => ({ item: i.id, amount: Number(prices[i.id]), currency })),
        })
      );
      if (file) fd.append("file", file);
      const res = await fetch(`/api/public/provider-link/${encodeURIComponent(token)}`, { method: "POST", body: fd });
      if (!res.ok) {
        setError(await readApiError(res, "That didn't go through. Please try again."));
        return;
      }
      setDone(await res.json());
    } catch {
      setError("That didn't go through. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const received = done ? done.prices + done.extracted : 0;

  return (
    <div className="mx-auto w-full max-w-xl">
      {missing ? (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">This link isn&apos;t valid any more.</div>
      ) : !info ? (
        <div className="h-64 animate-pulse rounded-2xl bg-surface" />
      ) : done ? (
        <div className="rounded-2xl border border-emerald-200 bg-surface p-6 text-center shadow-card">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Check size={24} aria-hidden />
          </span>
          <h1 className="mt-3 text-lg font-semibold text-ink">Thank you</h1>
          <p className="mt-1 text-sm text-muted">
            {info.client.name}&apos;s network team has your details{received ? ` and ${received} price${received > 1 ? "s" : ""}` : ""}.
            {done.extracted ? ` ${done.extracted} of them were read from your price list.` : ""}
            {done.note ? ` ${done.note}` : ""}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <p className="text-xs font-medium text-muted">Provider network · {info.provider.ref}</p>
            <h1 className="mt-1 text-xl font-bold text-ink">{info.provider.facility}</h1>
            <p className="mt-1 text-sm text-muted">
              {info.client.name} is {info.client.about}. Please confirm your details and share your prices for self-paying patients. It takes two minutes.
            </p>
            <p className="mt-3 text-sm text-ink">
              {info.provider.name} · {info.provider.specialty}
              <br />
              {info.provider.address}, {info.provider.district}, {info.provider.city}
            </p>
            {info.submittedAt ? <p className="mt-2 text-xs text-emerald-700">You already answered; sending again updates what we have.</p> : null}
          </div>

          <div className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="font-semibold text-ink">Your practice</h2>
            <label className="block">
              <span className={label}>Opening hours</span>
              <input value={hours} onChange={(e) => setHours(e.target.value)} className={field} placeholder="e.g. Mon–Fri 8:00–18:00, Sat 9:00–13:00" />
            </label>
            <label className="block">
              <span className={label}>Do you bill assistance companies directly against a guarantee of payment?</span>
              <select value={billing} onChange={(e) => setBilling(e.target.value as "yes" | "no" | "")} className={field}>
                <option value="">Please choose</option>
                <option value="yes">Yes, direct billing</option>
                <option value="no">No, patients pay and claim back</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Your name</span>
                <input value={contact} onChange={(e) => setContact(e.target.value)} className={field} />
              </label>
              <label className="block">
                <span className={label}>Best e-mail for referrals</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
              </label>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-ink">Prices for self-paying patients</h2>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink" aria-label="Currency">
                <option value="EUR">EUR €</option>
                <option value="TRY">TRY ₺</option>
                <option value="USD">USD $</option>
              </select>
            </div>
            <p className="text-xs text-muted">Fill in what applies, or upload your price list below and we&apos;ll read it.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {info.items.map((i) => (
                <label key={i.id} className="block">
                  <span className={label}>{i.label}</span>
                  <input type="number" min={0} step={5} inputMode="decimal" value={prices[i.id] ?? ""} onChange={(e) => setPrices({ ...prices, [i.id]: e.target.value })} className={field} placeholder={currency === "TRY" ? "₺" : currency === "USD" ? "$" : "€"} />
                </label>
              ))}
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-canvas px-4 py-4 text-sm text-ink hover:border-brand/40">
              <FileUp size={18} className="text-brand" aria-hidden />
              {file ? file.name : "Upload your price list (PDF or photo)"}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <label className="block">
              <span className={label}>Anything else we should know</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={field} placeholder="Interpreter available, parking, appointment lead time…" />
            </label>
          </div>
          {error ? <ErrorBanner message={error} /> : null}
          <Button type="submit" busy={busy} className="w-full">
            Send to {info.client.name}
          </Button>
          <p className="text-center text-[11px] text-muted">Your details are used only to refer patients to your practice.</p>
        </form>
      )}
    </div>
  );
}
