"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, SendHorizonal, User } from "lucide-react";
import { Button, Card, EmptyState, SectionTitle } from "@/components/ui";
import type { TranscriptLine } from "@/lib/voice/client/use-grok-voice";

/** Live transcript with in-progress captions and a text box into the same session. */
export function TranscriptPanel({
  lines,
  partial,
  live,
  onSend,
}: {
  lines: TranscriptLine[];
  partial: { user: string; agent: string };
  live: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [lines.length, partial.user, partial.agent]);

  return (
    <Card className="flex h-[440px] flex-col">
      <SectionTitle>Live transcript</SectionTitle>
      <div ref={boxRef} role="log" aria-live="polite" aria-label="Conversation transcript" className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
        {lines.length === 0 && !partial.agent && !partial.user ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState title="Start the session to begin" hint="Try: “I’m in Taksim and I need to see a doctor tomorrow afternoon.”" />
          </div>
        ) : (
          lines.map((t) => <Bubble key={t.id} role={t.role} text={t.text} />)
        )}
        {partial.agent ? <Bubble role="agent" text={partial.agent} pending /> : null}
        {partial.user ? <Bubble role="user" text={partial.user} pending /> : null}
      </div>
      <form
        className="mt-3 flex gap-2 border-t border-slate-100 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            onSend(text);
            setText("");
          }
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={live ? "…or type a message" : "Start the session first"}
          aria-label="Type a message to the agent"
          disabled={!live}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
        />
        <Button type="submit" disabled={!live || !text.trim()}>
          <SendHorizonal size={15} aria-hidden />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </Card>
  );
}

function Bubble({ role, text, pending }: { role: "user" | "agent"; text: string; pending?: boolean }) {
  const user = role === "user";
  return (
    <div className={`flex ${user ? "justify-end" : "justify-start"} ${pending ? "" : "animate-fade-up"}`}>
      <div
        className={`flex max-w-[85%] items-start gap-2 rounded-2xl px-4 py-2.5 text-sm ${
          user ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-slate-100 text-slate-800"
        } ${pending ? "opacity-70" : ""}`}
      >
        {user ? (
          <User size={15} className="mt-0.5 shrink-0 text-blue-200" aria-hidden />
        ) : (
          <Bot size={15} className="mt-0.5 shrink-0 text-blue-500" aria-hidden />
        )}
        <span className="leading-relaxed">
          <span className="sr-only">{user ? "You: " : "Agent: "}</span>
          {text}
          {pending ? "…" : ""}
        </span>
      </div>
    </div>
  );
}
