"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { BookOpenText, FileText, SendHorizonal, Sparkles } from "lucide-react";
import {
  Button,
  Card,
  ErrorBanner,
  PageHeader,
} from "@/components/ui";

/** Animated "assistant is thinking" indicator. */
function TypingIndicator() {
  return (
    <div className="flex justify-start" role="status" aria-label="The assistant is thinking">
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3">
        <Sparkles size={14} className="text-blue-500" aria-hidden />
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  sources?: { title: string; source: string }[];
}

const SUGGESTED = [
  "What documents are required for a hospitalization case?",
  "What is the status of CASE-1024?",
  "What is the process for arranging hospital admission?",
  "Which providers are available in Istanbul?",
  "When does a claim need to be escalated?",
];

export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  // Pin the chat to the latest message (scoped to the box — scrollIntoView
  // would also scroll the page).
  useEffect(() => {
    const box = chatBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    setTurns((t) => [...t, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "The assistant could not answer — please try again.");
        return;
      }
      const body = await res.json();
      setTurns((t) => [
        ...t,
        { role: "assistant", text: body.answer, sources: body.sources },
      ]);
    } catch {
      setError("The assistant is unreachable — please check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Internal AI Assistant"
        subtitle="Answers from the seeded operational knowledge base and live case / provider data — with sources."
      />
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      <Card className="flex h-[62vh] min-h-[480px] flex-col">
        <div ref={chatBoxRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
          {turns.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <BookOpenText size={28} className="text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-500">
                Ask about cases, providers or operational procedures
              </p>
              <div className="mt-4 flex max-w-md flex-wrap justify-center gap-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="animate-fade-up flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-sm text-white shadow-sm">
                    {t.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="animate-fade-up flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5">
                    <div className="prose-chat text-sm leading-relaxed text-slate-800">
                      <Markdown>{t.text}</Markdown>
                    </div>
                    {t.sources?.length ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Sources
                        </span>
                        {t.sources.map((s) => (
                          <span
                            key={s.title}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500"
                          >
                            <FileText size={10} aria-hidden />
                            {s.title}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            )
          )}
          {busy ? <TypingIndicator /> : null}
        </div>
        <form
          className="mt-4 flex gap-2 border-t border-slate-100 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a question…"
            aria-label="Ask the assistant a question"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <Button type="submit" disabled={busy || input.trim().length === 0}>
            <SendHorizonal size={15} />
            Ask
          </Button>
        </form>
      </Card>

      <p className="mt-3 text-xs text-slate-400">
        The assistant only answers from the fictional demo knowledge base and demo
        database — it does not give medical advice.
      </p>
    </div>
  );
}
