"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  KeyValue,
  PageHeader,
  SectionTitle,
  SkeletonRows,
  StatusBadge,
  readApiError,
} from "@/components/ui";
import { AIPipeline } from "@/components/ai-progress";
import { formatEnum } from "@/lib/format";

const ANALYSIS_STAGES = [
  "Reading the request",
  "Identifying patient, location and symptoms",
  "Assessing urgency",
  "Preparing suggested actions",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HIGHLIGHT_STYLES = {
  location: "bg-sky-100 text-sky-900",
  symptom: "bg-rose-100 text-rose-900",
  patient: "bg-violet-100 text-violet-900",
  caseRef: "bg-amber-100 text-amber-900",
} as const;

type HighlightKind = keyof typeof HIGHLIGHT_STYLES;

/**
 * Renders the request text with the AI's extracted entities highlighted in
 * place — the audience sees exactly where each field came from.
 */
function HighlightedRequest({
  text,
  analysis,
}: {
  text: string;
  analysis: Analysis;
}) {
  // Extracted values are canonical ("Taksim, Istanbul", "Abdominal pain") and
  // rarely appear verbatim, so each phrase is also matched word-by-word.
  const STOPWORDS = new Set([
    "the", "and", "with", "near", "severe", "acute", "chronic", "mild",
    "traveller's", "traveller", "patient", "unknown", "general",
  ]);
  const termMap = new Map<string, HighlightKind>();
  const addTerm = (value: string | null, kind: HighlightKind) => {
    if (!value) return;
    const phrase = value.trim();
    if (phrase.length >= 3) termMap.set(phrase.toLowerCase(), kind);
    for (const word of phrase.split(/[\s,;/]+/)) {
      const w = word.trim();
      if (w.length >= 4 && !STOPWORDS.has(w.toLowerCase())) {
        if (!termMap.has(w.toLowerCase())) termMap.set(w.toLowerCase(), kind);
      }
    }
  };
  addTerm(analysis.location, "location");
  for (const s of analysis.symptoms) addTerm(s, "symptom");
  addTerm(analysis.medicalIssue, "symptom");
  addTerm(analysis.patient, "patient");
  addTerm(analysis.existingCaseRef, "caseRef");

  // Longest first so full phrases win over their own words.
  const usable = [...termMap.keys()].sort((a, b) => b.length - a.length);
  if (usable.length === 0) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{text}</p>;
  }
  const pattern = new RegExp(`(${usable.map(escapeRegExp).join("|")})`, "gi");
  const kindFor = (match: string): HighlightKind =>
    termMap.get(match.toLowerCase()) ?? "location";
  const parts = text.split(pattern);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className={`rounded px-1 py-0.5 font-medium ${HIGHLIGHT_STYLES[kindFor(part)]}`}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

const SAMPLE_REQUEST =
  "My husband is travelling in Istanbul and has developed severe stomach pain. We are staying near Taksim. We need help finding a hospital.";

interface Analysis {
  patient: string | null;
  location: string | null;
  country: string | null;
  medicalIssue: string | null;
  symptoms: string[];
  assistanceType: string;
  urgency: string;
  requestedAction: string | null;
  existingCaseRef: string | null;
  summary: string;
  suggestedActions: string[];
  existingCase: { ref: string; status: string; id: string } | null;
}

interface CaseRow {
  id: string;
  ref: string;
  title: string;
  location: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  createdAt: string;
  patient: { firstName: string; lastName: string };
}

export default function CasesPage() {
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdRef, setCreatedRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const loadCases = useCallback(async () => {
    try {
      const res = await fetch("/api/cases");
      if (res.ok) setCases((await res.json()).cases ?? []);
    } catch {
      // non-critical
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  async function analyze() {
    setError(null);
    setCreatedRef(null);
    setAnalysis(null);
    if (text.trim().length < 10) {
      setError("Please describe the assistance request (at least 10 characters).");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch("/api/cases/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The request could not be analysed."));
        return;
      }
      setAnalysis((await res.json()).analysis);
    } catch {
      setError("Analysis failed — please check your connection and try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function createCase() {
    if (!analysis) return;
    setCreating(true);
    setError(null);
    try {
      const analysisPayload = { ...analysis, existingCase: undefined };
      delete analysisPayload.existingCase;
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestText: text, analysis: analysisPayload }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The case could not be created."));
        return;
      }
      const body = await res.json();
      setCreatedRef(body.case.ref);
      setAnalysis(null);
      setText("");
      loadCases();
    } catch {
      setError("Case creation failed — please try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="AI Case Manager"
        subtitle="Paste an incoming assistance request — AI extracts the who, where and what, then turns it into an actionable case."
      />
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}
      {createdRef ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} />
          Case <span className="font-semibold">{createdRef}</span> created —
          <Link href={`/cases/${createdRef}`} className="font-semibold underline">
            open the case
          </Link>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Incoming assistance request</SectionTitle>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Describe the request — e.g. an email or call transcript from a traveller…"
            className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-800 transition-shadow placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={analyze} busy={analyzing}>
              <Sparkles size={15} />
              Analyse with AI
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setText(SAMPLE_REQUEST);
                setError(null);
              }}
            >
              Use sample request
            </Button>
          </div>
        </Card>

        <div className="space-y-5">
          {analyzing ? (
            <Card>
              <AIPipeline busy stages={ANALYSIS_STAGES} />
            </Card>
          ) : analysis ? (
            <>
              <Card className="animate-fade-up">
                <SectionTitle>Case summary</SectionTitle>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {analysis.summary}
                </p>
                {analysis.existingCase ? (
                  <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    Mentions existing case{" "}
                    <Link
                      href={`/cases/${analysis.existingCase.ref}`}
                      className="font-semibold underline"
                    >
                      {analysis.existingCase.ref}
                    </Link>{" "}
                    ({formatEnum(analysis.existingCase.status)}).
                  </p>
                ) : null}
              </Card>
              <Card className="animate-fade-up" style={{ animationDelay: "70ms" }}>
                <SectionTitle>What the AI read</SectionTitle>
                <div className="mt-2">
                  <HighlightedRequest text={text} analysis={analysis} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                  <span><span className="rounded bg-sky-100 px-1">location</span></span>
                  <span><span className="rounded bg-rose-100 px-1">symptoms</span></span>
                  <span><span className="rounded bg-violet-100 px-1">patient</span></span>
                  <span><span className="rounded bg-amber-100 px-1">case reference</span></span>
                </div>
              </Card>
              <Card className="animate-fade-up" style={{ animationDelay: "140ms" }}>
                <SectionTitle>Extracted information</SectionTitle>
                <dl className="mt-2 grid grid-cols-2 gap-x-4">
                  <KeyValue label="Patient" value={analysis.patient} />
                  <KeyValue label="Location" value={analysis.location} />
                  <KeyValue label="Medical issue" value={analysis.medicalIssue} />
                  <KeyValue
                    label="Assistance type"
                    value={formatEnum(analysis.assistanceType)}
                  />
                  <KeyValue
                    label="Urgency"
                    value={<StatusBadge value={analysis.urgency} />}
                  />
                  <KeyValue label="Requested action" value={analysis.requestedAction} />
                </dl>
              </Card>
              <Card className="animate-fade-up" style={{ animationDelay: "210ms" }}>
                <SectionTitle>Suggested actions</SectionTitle>
                <ul className="mt-2 space-y-1.5">
                  {analysis.suggestedActions.map((a) => (
                    <li key={a} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      {a}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <Button onClick={createCase} busy={creating} variant="success">
                    Create Case
                  </Button>
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <EmptyState
                title="No analysis yet"
                hint="Paste a request on the left and click “Analyse with AI”."
              />
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-5">
        <SectionTitle>Recent cases</SectionTitle>
        {listLoading ? (
          <div className="mt-3"><SkeletonRows rows={5} /></div>
        ) : cases.length === 0 ? (
          <div className="mt-3"><EmptyState title="No cases yet" /></div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-semibold">Case</th>
                  <th className="py-2 pr-4 font-semibold">Patient</th>
                  <th className="py-2 pr-4 font-semibold">Location</th>
                  <th className="py-2 pr-4 font-semibold">Priority</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Assigned to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-slate-50">
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/cases/${c.ref}`}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        {c.ref}
                      </Link>
                      <p className="max-w-[260px] truncate text-xs text-slate-400">
                        {c.title}
                      </p>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700">
                      {c.patient.firstName} {c.patient.lastName}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700">{c.location}</td>
                    <td className="py-2.5 pr-4"><StatusBadge value={c.priority} /></td>
                    <td className="py-2.5 pr-4"><StatusBadge value={c.status} /></td>
                    <td className="py-2.5 text-slate-500">
                      {c.assignedTo ?? "Unassigned"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
