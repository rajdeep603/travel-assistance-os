"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileUp, Sparkles } from "lucide-react";
import {
  AISourceBadge,
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
import { AIPipeline, usePipeline } from "@/components/ai-progress";
import { SampleFiles } from "@/components/sample-files";
import { formatEnum } from "@/lib/format";
import { QUICK_SAMPLE_REQUEST } from "@/lib/samples/intake-requests";

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
  source?: string;
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

/** "Elif Demirtas (Case Manager)" as a name with the role beneath it, so the column stays one line wide. */
function Assignee({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-400">Unassigned</span>;
  const m = value.match(/^(.*?)\s*\((.+)\)\s*$/);
  if (!m) return <>{value}</>;
  return (
    <>
      <span className="block text-slate-700">{m[1]}</span>
      <span className="block text-xs text-slate-400">{m[2]}</span>
    </>
  );
}

export default function CasesPage() {
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdRef, setCreatedRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pipeline = usePipeline(analyzing, ANALYSIS_STAGES.length, { failed: !!error });
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const requestFile = useRef<HTMLInputElement>(null);

  /** A request saved as text (call note, chat export, e-mail) into the box. */
  async function loadRequest(file: File) {
    if (file.size > 64 * 1024) {
      setError(`“${file.name}” is too large for a request; paste the relevant part instead.`);
      return;
    }
    const content = (await file.text()).trim();
    if (!content) {
      setError(`“${file.name}” is empty.`);
      return;
    }
    setText(content.slice(0, 4000));
    setAnalysis(null);
    setError(content.length > 4000 ? "Only the first 4,000 characters were loaded." : null);
  }

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
    <div className="mx-auto max-w-7xl">
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
        {/* The request stays in view (wide screens) while the analysis beside it scrolls. */}
        <Card className="lg:sticky lg:top-20 lg:self-start">
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
                setText(QUICK_SAMPLE_REQUEST);
                setError(null);
              }}
            >
              Use sample request
            </Button>
            <Button variant="secondary" onClick={() => requestFile.current?.click()}>
              <FileUp size={15} aria-hidden />
              Load from file
            </Button>
            <input
              ref={requestFile}
              type="file"
              accept=".txt,text/plain"
              aria-label="Load a request from a text file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadRequest(f);
                e.target.value = "";
              }}
            />
          </div>
          <SampleFiles section="intake" className="mt-4 border-t border-line pt-3" />
        </Card>

        <div className="space-y-5">
          {pipeline.visible ? (
            <Card className="h-full">
              <AIPipeline stages={ANALYSIS_STAGES} active={pipeline.active} />
            </Card>
          ) : analysis ? (
            <>
              <Card className="animate-fade-up">
                <div className="flex items-center justify-between gap-2">
                  <SectionTitle>Case summary</SectionTitle>
                  <AISourceBadge source={analysis.source} />
                </div>
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
            <Card className="h-full">
              <SectionTitle>What the AI will extract</SectionTitle>
              <p className="mt-1 text-sm text-muted">
                Paste a request, or use the sample, and click “Analyse with AI”.
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4">
                {["Patient", "Location", "Medical issue", "Assistance type", "Urgency", "Requested action"].map((label) => (
                  <KeyValue key={label} label={label} value={null} />
                ))}
              </dl>
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
            {/* Portrait tablets drop "Assigned to" so the other columns keep one line each. */}
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="py-2 pr-4 font-medium">Case</th>
                  <th className="py-2 pr-4 font-medium">Patient</th>
                  <th className="py-2 pr-4 font-medium">Location</th>
                  <th className="py-2 pr-4 font-medium">Priority</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="hidden py-2 font-medium lg:table-cell">Assigned to</th>
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
                      <p translate="no" className="max-w-[260px] truncate text-xs text-slate-400">
                        {c.title}
                      </p>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-slate-700">
                      {c.patient.firstName} {c.patient.lastName}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700">{c.location}</td>
                    <td className="py-2.5 pr-4"><StatusBadge value={c.priority} /></td>
                    <td className="py-2.5 pr-4"><StatusBadge value={c.status} /></td>
                    <td className="hidden py-2.5 text-slate-500 lg:table-cell">
                      <Assignee value={c.assignedTo} />
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
