"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Send, UserRound } from "lucide-react";
import { T } from "@/components/i18n";
import { Button, Card, ErrorBanner, SectionTitle, readApiError } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { FamilyContact, FamilyUpdate } from "@/lib/services/family-updates";

// ---------------------------------------------------------------------------
// Updates to the family: the relative who called hears from us at each step on
// WhatsApp (automatically when the guarantee goes out and when the case closes),
// so they don't have to call and ask where things are.
// ---------------------------------------------------------------------------

interface Data {
  contact: FamilyContact;
  maskedPhone: string | null;
  updates: FamilyUpdate[];
  suggestion: string;
}

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

export function FamilyUpdatesCard({ caseId }: { caseId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", relation: "", phone: "", language: "" });
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/family`);
    if (res.ok) setData(await res.json());
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(key: string, method: "PATCH" | "POST", body: unknown) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/family`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Couldn't save that. Please try again."));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!data) return null;
  const { contact } = data;
  const draft = text ?? data.suggestion;

  async function saveContact() {
    if (await call("contact", "PATCH", { ...form, automatic: true })) {
      setEditing(false);
      await load();
    }
  }

  function startEditing() {
    setForm({ name: contact.name ?? "", relation: contact.relation ?? "", phone: contact.phone ?? "", language: contact.language ?? "" });
    setEditing(true);
  }

  return (
    <Card>
      <SectionTitle>Updates to the family</SectionTitle>
      <p className="mt-0.5 text-xs text-muted">On WhatsApp at each step, so nobody has to call to ask where things are.</p>
      {error ? <ErrorBanner message={error} /> : null}

      {!contact.phone || editing ? (
        <div className="mt-3 grid gap-2">
          <input className={field} placeholder="Name, e.g. Grace Bennett" aria-label="Family contact's name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={field} placeholder="Relationship, e.g. Daughter" aria-label="Relationship" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
            <input className={field} placeholder="Language, e.g. English" aria-label="Language" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
          </div>
          <input className={field} inputMode="tel" placeholder="WhatsApp number, e.g. +44 7700 900218" aria-label="WhatsApp number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div className="flex gap-2">
            <Button busy={busy === "contact"} onClick={() => void saveContact()}>
              Save contact
            </Button>
            {editing ? (
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-start justify-between gap-3">
            <p className="flex min-w-0 items-start gap-2 text-sm text-ink">
              <UserRound size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
              <span className="min-w-0">
                <span className="font-medium" translate="no">{contact.name ?? "Family contact"}</span>
                {contact.relation ? <span className="text-muted"> · {contact.relation}</span> : null}
                <span className="block text-xs text-muted">
                  <bdi dir="ltr">{data.maskedPhone}</bdi>
                  {contact.language ? ` · ${contact.language}` : ""}
                </span>
              </span>
            </p>
            <button type="button" onClick={startEditing} className="shrink-0 text-xs font-medium text-brand hover:underline">
              Edit
            </button>
          </div>
          <label className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2 text-sm text-ink">
            <span>Automatic updates at each step</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={contact.automatic}
              disabled={busy === "toggle"}
              onChange={(e) => void call("toggle", "PATCH", { automatic: e.target.checked }).then(load)}
            />
          </label>

          {data.updates.length ? (
            <ul className="mt-3 space-y-2">
              {data.updates.map((u) => (
                <li key={u.id} className="rounded-xl bg-emerald-50/70 px-3 py-2 ring-1 ring-emerald-100">
                  <p className="text-[13px] leading-snug text-ink">{u.text}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
                    <MessageCircle size={11} className="text-emerald-600" aria-hidden />
                    {formatDateTime(u.at)} · <T>{u.automatic ? "Automatic" : "Sent by the team"}</T>
                    {u.simulated ? (
                      <>
                        {" · "}
                        <T>Simulated (demo number)</T>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted">No updates sent yet.</p>
          )}

          <div className="mt-3">
            <textarea
              rows={3}
              aria-label="Next update"
              value={draft}
              onChange={(e) => setText(e.target.value)}
              className={`${field} text-[13px] leading-snug`}
            />
            <Button
              className="mt-2"
              busy={busy === "send"}
              onClick={() =>
                void call("send", "POST", { text: draft }).then(async (ok) => {
                  if (ok) {
                    setText(null);
                    await load();
                  }
                })
              }
            >
              <Send size={14} aria-hidden /> Send update
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
