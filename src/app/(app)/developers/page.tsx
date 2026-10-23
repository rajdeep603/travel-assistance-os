"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Play, Plus, Send, Trash2, Webhook, XCircle } from "lucide-react";
import { Button, Card, ErrorBanner, PageHeader, SectionTitle, readApiError } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

interface Delivery {
  id: string;
  event: string;
  statusCode: number | null;
  ok: boolean;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface Endpoint {
  id: string;
  url: string;
  events: string[];
  secret: string;
  description: string | null;
  createdAt: string;
  deliveries: Delivery[];
}

const ENDPOINTS: { method: "GET" | "POST"; path: string; what: string; example: string }[] = [
  { method: "GET", path: "/api/v1/cases/{ref}", what: "A case: status, priority, patient, guarantees, claims and the latest events.", example: "/api/v1/cases/CASE-1024" },
  { method: "POST", path: "/api/v1/cases", what: 'Opens a case from a request ({"request": "…", "policyNumber": "…"}); the AI reads urgency, place and the medical issue.', example: "/api/v1/cases" },
  { method: "GET", path: "/api/v1/guarantees/{ref}", what: "A Letter of Guarantee: status, amounts, validity, why it waits for a person.", example: "/api/v1/guarantees/LOG-0902" },
  { method: "GET", path: "/api/v1/claims/{ref}", what: "A claim: status, what's missing, and the settlement once approved.", example: "/api/v1/claims/CLM-10230" },
  { method: "POST", path: "/api/v1/documents", what: "Multipart file (and optional caseRef): what was read, plus the bill review for an invoice.", example: "/api/v1/documents" },
];

const VERIFY = `// Node.js: check the signature before trusting a webhook
import { createHmac, timingSafeEqual } from "node:crypto";

const expected = "sha256=" + createHmac("sha256", process.env.WEBHOOK_SECRET)
  .update(rawBody).digest("hex");
const given = req.headers["x-caretrail-signature"];
const ok = given && expected.length === given.length &&
  timingSafeEqual(Buffer.from(expected), Buffer.from(given));`;

export default function DevelopersPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [apiKeys, setApiKeys] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>(["*"]);
  const [created, setCreated] = useState<{ url: string; secret: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tryRef, setTryRef] = useState("/api/v1/cases/CASE-1024");
  const [tryOut, setTryOut] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/webhooks", { cache: "no-store" });
    if (!res.ok) return setError(await readApiError(res, "Webhooks could not be loaded."));
    const body = await res.json();
    setEndpoints(body.endpoints);
    setEvents(body.events);
    setApiKeys(body.apiKeys);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(id: string, fn: () => Promise<Response>, onOk?: (r: Response) => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) throw new Error(await readApiError(res, "That didn't work."));
      await onOk?.(res);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  async function tryIt() {
    setBusy("try");
    setTryOut(null);
    try {
      const res = await fetch(tryRef, { cache: "no-store" });
      setTryOut(`HTTP ${res.status}\n${JSON.stringify(await res.json().catch(() => null), null, 2)}`);
    } finally {
      setBusy(null);
    }
  }

  const toggle = (e: string) => setPicked((p) => (e === "*" ? ["*"] : p.includes(e) ? p.filter((x) => x !== e) : [...p.filter((x) => x !== "*"), e]));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Developers"
        subtitle="Connect your case system: read cases, guarantees and claims, open cases and send documents through the API, and get events pushed to you by webhook, signed."
      />
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>API (v1)</SectionTitle>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <KeyRound size={13} aria-hidden /> {apiKeys ? `${apiKeys} API key${apiKeys === 1 ? "" : "s"} set up` : "No API keys yet: set API_KEYS on the server"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Send <code className="rounded bg-canvas px-1 text-[13px]">Authorization: Bearer &lt;key&gt;</code>. JSON in and out; references (CASE-1024, LOG-0902) identify records.
          </p>
          <ul className="mt-3 divide-y divide-line/60">
            {ENDPOINTS.map((e) => (
              <li key={`${e.method} ${e.path}`} className="py-2.5">
                <p className="font-mono text-[13px] text-ink">
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold ${e.method === "GET" ? "bg-brand-2/15 text-brand-deep" : "bg-live/15 text-live"}`}>{e.method}</span>
                  {e.path}
                </p>
                <p className="mt-0.5 text-sm text-muted">{e.what}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-xl border border-line/70 p-3">
            <p className="text-xs font-medium text-muted">Try it (with your session)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <select value={tryRef} onChange={(e) => setTryRef(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[13px]">
                {ENDPOINTS.filter((e) => e.method === "GET").map((e) => (
                  <option key={e.example} value={e.example}>
                    GET {e.example}
                  </option>
                ))}
              </select>
              <Button variant="secondary" onClick={() => void tryIt()} busy={busy === "try"}>
                <Play size={15} aria-hidden /> Send
              </Button>
            </div>
            {tryOut ? <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-stage p-3 text-[12px] leading-relaxed text-stage-ink">{tryOut}</pre> : null}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>Webhooks</SectionTitle>
            <Webhook size={16} className="text-muted" aria-hidden />
          </div>
          <p className="mt-1 text-sm text-muted">We post each event to your URL, signed with the endpoint&apos;s secret in the X-CareTrail-Signature header (HMAC-SHA256 of the body). Every delivery is logged below.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["*", ...events].map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggle(e)}
                aria-pressed={picked.includes(e)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[12px] transition-colors ${picked.includes(e) ? "border-transparent bg-brand bg-brand-gradient text-white" : "border-line bg-surface text-ink/80 hover:bg-canvas"}`}
              >
                {e === "*" ? "all events" : e}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-system.example/hooks/caretrail" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
            <Button
              onClick={() =>
                void call(
                  "add",
                  () => fetch("/api/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, events: picked }) }),
                  async (r) => {
                    const { endpoint } = await r.json();
                    setCreated({ url: endpoint.url, secret: endpoint.secret });
                    setUrl("");
                  }
                )
              }
              busy={busy === "add"}
              disabled={url.trim().length < 8 || picked.length === 0}
            >
              <Plus size={15} aria-hidden /> Add endpoint
            </Button>
          </div>
          {created ? (
            <p className="mt-3 rounded-lg border border-brand/30 bg-brand/[0.05] px-3 py-2 text-sm text-ink">
              Signing secret for {created.url}: <code className="break-all font-mono text-[13px]">{created.secret}</code>
              <span className="block text-xs text-muted">Shown once: copy it into your receiver now.</span>
            </p>
          ) : null}

          <ul className="mt-4 space-y-3">
            {endpoints.map((e) => (
              <li key={e.id} className="rounded-xl border border-line/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-[13px] text-ink">{e.url}</p>
                    <p className="text-xs text-muted">
                      {e.events.includes("*") ? "All events" : e.events.join(", ")} · secret {e.secret}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="secondary" onClick={() => void call(`ping-${e.id}`, () => fetch(`/api/webhooks/${e.id}/ping`, { method: "POST" }))} busy={busy === `ping-${e.id}`}>
                      <Send size={14} aria-hidden /> Test
                    </Button>
                    <Button variant="danger" aria-label={`Remove ${e.url}`} onClick={() => void call(`del-${e.id}`, () => fetch(`/api/webhooks/${e.id}`, { method: "DELETE" }))} busy={busy === `del-${e.id}`}>
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  </div>
                </div>
                {e.deliveries.length ? (
                  <ul className="mt-2 space-y-1 text-xs">
                    {e.deliveries.map((d) => (
                      <li key={d.id} className="flex items-center gap-2">
                        {d.ok ? <CheckCircle2 size={13} className="text-emerald-500" aria-hidden /> : <XCircle size={13} className="text-red-500" aria-hidden />}
                        <span className="font-mono text-ink/85">{d.event}</span>
                        <span className="text-muted">
                          {d.statusCode ? `HTTP ${d.statusCode}` : d.error} · {d.durationMs ?? "—"} ms · {formatDateTime(d.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted">No deliveries yet: press Test.</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-5">
        <SectionTitle>Checking a webhook&apos;s signature</SectionTitle>
        <pre className="mt-3 overflow-auto rounded-lg bg-stage p-4 text-[12.5px] leading-relaxed text-stage-ink">{VERIFY}</pre>
        <p className="mt-2 text-xs text-muted">
          Events: case.created, guarantee.sent, claim.settled, call.completed, receivable.paid, handoff.updated (and ping, from Test). Each body carries id, event, createdAt and data.
        </p>
      </Card>

      <Card className="mt-5">
        <SectionTitle>SIP connector: calls from your contact centre</SectionTitle>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink/85">
          <li>Your contact centre (Genesys Cloud BYOC, Avaya, Cisco, a PBX) routes overflow or after-hours calls to our SIP domain, which answers with the hotline agent.</li>
          <li>
            Pass what you already know in SIP headers: <code className="rounded bg-canvas px-1 font-mono text-[12px]">X-Case-Ref: CASE-1024</code> links the call to the case;{" "}
            <code className="rounded bg-canvas px-1 font-mono text-[12px]">X-Language: German</code> opens the agent in that language. The caller&apos;s number is read from the SIP From.
          </li>
          <li>
            Transfers go back to you: set the case manager or on-call doctor target to your queue&apos;s SIP address (for example{" "}
            <code className="rounded bg-canvas px-1 font-mono text-[12px]">sip:overflow@yourorg.byoc.example</code>), and whoever picks up hears the AI&apos;s summary first.
          </li>
        </ol>
      </Card>
    </div>
  );
}
