"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PhoneIncoming, PhoneOutgoing } from "lucide-react";
import {
  NumberPicker,
  type NumberEntry,
} from "@/components/calls/number-picker";
import {
  Button,
  Card,
  ErrorBanner,
  SectionTitle,
  readApiError,
} from "@/components/ui";
import { maskPhone } from "@/lib/format";

// ---------------------------------------------------------------------------
// The phone half of a demo step: the agent on screen rings a real phone (the
// prospect's own mobile, approved on the spot) about the case the step is
// on. Outbound agents dial it; for the hotline and the other inbound agents
// the hotline rings it and greets whoever answers. The call then shows live
// on the page.
// ---------------------------------------------------------------------------

interface Options {
  telephonyConfigured: boolean;
  numbers: NumberEntry[];
  agents: {
    id: string;
    audience: "traveller" | "provider" | null;
    suggestedNumber: string | null;
    suggestedAllowed: boolean;
  }[];
}

export interface PhoneCallTarget {
  agentId: string;
  agentLabel: string;
  direction: "inbound" | "outbound";
  caseId: string | null;
  caseRef: string | null;
  record: string | null;
  /** Why the agent can't start on this case; null when it can. */
  blocked: string | null;
}

export function PhoneCallPanel({
  target,
  language,
  disabled,
  onPlaced,
}: {
  target: PhoneCallTarget;
  language: string;
  disabled: boolean;
  /** A call is on its way: show it live. */
  onPlaced: (call: { id: string; ref: string } | null) => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<
    | { kind: "outbound"; id: string; ref: string; to: string }
    | { kind: "ring"; to: string }
    | null
  >(null);
  const outbound = target.direction === "outbound";

  useEffect(() => {
    const q = target.caseId
      ? `?caseId=${encodeURIComponent(target.caseId)}`
      : "";
    fetch(`/api/calls/outbound/options${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: Options | null) => {
        if (!body) return;
        setOptions(body);
        const agent = body.agents.find((a) => a.id === target.agentId);
        setTo(
          (current) =>
            current ||
            (agent?.suggestedAllowed && agent.suggestedNumber
              ? agent.suggestedNumber
              : (body.numbers[0]?.number ?? "")),
        );
      })
      .catch(() => undefined);
  }, [target.caseId, target.agentId]);

  // A new step or agent: the last call's status no longer applies.
  useEffect(() => {
    setPlaced(null);
    setError(null);
  }, [target.agentId, target.caseId, target.record]);

  async function call() {
    setBusy(true);
    setError(null);
    try {
      const res = outbound
        ? await fetch("/api/calls/outbound", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profile: target.agentId,
              caseId: target.caseId ?? undefined,
              to,
              language: language || undefined,
              record: target.record ?? undefined,
            }),
          })
        : await fetch("/api/calls/ring-me", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to }),
          });
      if (!res.ok) {
        setError(await readApiError(res, "The call could not be placed."));
        return;
      }
      const body = await res.json();
      if (outbound) {
        setPlaced({
          kind: "outbound",
          id: body.call.id,
          ref: body.call.ref,
          to,
        });
        onPlaced({ id: body.call.id, ref: body.call.ref });
      } else {
        setPlaced({ kind: "ring", to });
        onPlaced(null);
      }
    } catch {
      setError("The call could not be placed — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!options) return null;
  if (!options.telephonyConfigured) {
    return (
      <Card>
        <SectionTitle>Call by phone</SectionTitle>
        <p className="mt-2 text-xs text-muted">
          The phone line isn&apos;t connected on this server, so this step runs
          in the browser.
        </p>
      </Card>
    );
  }
  const agent = options.agents.find((a) => a.id === target.agentId);
  const suggested = agent?.suggestedNumber
    ? {
        number: agent.suggestedNumber,
        tag: agent.audience === "provider" ? "hospital" : "patient",
      }
    : null;
  const cannot = target.blocked;

  return (
    // The Card doesn't forward data attributes; the wrapper carries the test id.
    <div data-testid="phone-call-panel">
      <Card>
        <SectionTitle>Call by phone</SectionTitle>
        <p className="mt-2 text-xs text-muted">
          {outbound ? (
            <>
              <span className="font-semibold text-ink">
                {target.agentLabel}
              </span>{" "}
              rings this number and talks about{" "}
              <span className="font-semibold text-ink">
                {target.caseRef ?? target.record ?? "the record"}
              </span>
              , as it would the real{" "}
              {agent?.audience === "provider" ? "hospital" : "traveller"}.
              Whoever answers plays that side; the cue lines above are theirs.
            </>
          ) : (
            <>
              The 24/7 hotline rings this number and greets whoever answers,
              exactly as on a dialled-in call. A visitor&apos;s own mobile
              works: add it with its country code.
            </>
          )}
        </p>
        <div className="mt-3 space-y-2">
          <NumberPicker
            value={to}
            onChange={setTo}
            numbers={options.numbers}
            onNumbers={(numbers) => setOptions({ ...options, numbers })}
            suggested={suggested}
            disabled={busy || disabled}
          />
          {cannot ? <p className="text-xs text-warn">{cannot}</p> : null}
          {error ? <ErrorBanner message={error} /> : null}
          {placed ? (
            <p className="text-sm text-emerald-700" role="status">
              {placed.kind === "outbound" ? (
                <>
                  Calling {maskPhone(placed.to)} —{" "}
                  <Link
                    href={`/calls/${placed.id}`}
                    className="font-semibold underline"
                  >
                    {placed.ref}
                  </Link>
                  . It shows live below as soon as it connects.
                </>
              ) : (
                <>
                  Ringing {maskPhone(placed.to)}: pick up. The call shows live
                  below once answered.
                </>
              )}
            </p>
          ) : null}
          <Button
            onClick={() => void call()}
            busy={busy}
            disabled={!to || Boolean(cannot) || disabled}
            className="w-full"
          >
            {outbound ? (
              <PhoneOutgoing size={15} aria-hidden />
            ) : (
              <PhoneIncoming size={15} aria-hidden />
            )}
            {outbound
              ? `Call ${to ? maskPhone(to) : "the number"} now`
              : `Ring ${to ? maskPhone(to) : "the phone"} now`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
