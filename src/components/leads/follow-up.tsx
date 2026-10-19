"use client";

import { useState } from "react";
import { CheckCircle2, Mail, PenLine, Send } from "lucide-react";
import { Button, Card, SectionTitle, readApiError } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

// The same-evening follow-up: drafted from the meeting notes, edited by the
// presenter, sent with the quotation attached.

interface Draft {
  to: string | null;
  subject: string;
  text: string;
  blocked: string | null;
  sentAt: string | null;
}

const FIELD =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30";

export function FollowUp({
  leadId,
  sentAt,
  onSent,
}: {
  leadId: string;
  sentAt: string | null;
  onSent: (lead: { status: string; followUpSentAt: string | null }) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function write() {
    setBusy("draft");
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/follow-up`);
      if (!res.ok) throw new Error(await readApiError(res, "The follow-up couldn't be drafted."));
      setDraft(((await res.json()) as { draft: Draft }).draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The follow-up couldn't be drafted.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!draft) return;
    setBusy("send");
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/follow-up`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: draft.subject, text: draft.text }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "The follow-up couldn't be sent."));
      const { lead } = (await res.json()) as { lead: { status: string; followUpSentAt: string | null } };
      onSent(lead);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The follow-up couldn't be sent.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <SectionTitle>Follow-up</SectionTitle>
      {sentAt ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-ink" role="status">
          <CheckCircle2 size={15} className="text-brand" aria-hidden /> Sent {formatDateTime(sentAt)}, with the quotation attached.
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted">A recap of the meeting from your notes, with the quotation attached. Send it the same evening.</p>
      )}

      {draft ? (
        <div className="mt-3 space-y-3">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Mail size={13} aria-hidden /> To <span className="font-medium text-ink [overflow-wrap:anywhere]">{draft.to ?? "no e-mail address yet"}</span>
          </p>
          <label className="block text-xs font-medium text-muted">
            Subject
            <input value={draft.subject} maxLength={200} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className={FIELD} />
          </label>
          <label className="block text-xs font-medium text-muted">
            Message
            <textarea value={draft.text} rows={14} maxLength={8000} onChange={(e) => setDraft({ ...draft, text: e.target.value })} className={`${FIELD} font-[inherit] leading-relaxed`} />
          </label>
          {draft.blocked ? <p className="text-xs text-warn">{draft.blocked}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button busy={busy === "send"} disabled={Boolean(draft.blocked)} onClick={() => void send()}>
              {busy === "send" ? null : <Send size={15} aria-hidden />}
              Send with the quotation
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button variant="secondary" busy={busy === "draft"} onClick={() => void write()}>
            {busy === "draft" ? null : <PenLine size={15} aria-hidden />}
            {sentAt ? "Write another follow-up" : "Write the follow-up"}
          </Button>
        </div>
      )}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </Card>
  );
}
