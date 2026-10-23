"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { History, Maximize2, MessageSquareText, Sparkles, SquarePen, X } from "lucide-react";
import { AssistantComposer, AssistantHistory, AssistantMessages, VoiceBar } from "./assistant-conversation";
import { NEW_TITLE, useAssistant } from "./assistant-provider";

/** Small icon button in the panel's header. */
function HeaderButton({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 ${
        pressed ? "bg-brand/10 text-brand" : "text-slate-500 hover:bg-slate-100 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The internal assistant on every page: a floating button bottom right that
 * opens a chat panel with voice mode and the conversation history. Hidden on
 * the assistant's own page and on the voice agents page (its own microphone).
 */
export function AssistantLauncher() {
  const pathname = usePathname();
  const { open, setOpen, view, setView, title, newConversation, voiceOn, threadId } = useAssistant();
  const panelRef = useRef<HTMLDivElement>(null);
  const hidden = pathname === "/assistant" || pathname.startsWith("/voice");

  // Escape closes the panel (voice mode keeps going in the background).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-command-palette]")) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (hidden) return null;
  const heading = threadId && title !== NEW_TITLE ? title : "AI assistant";

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="assistant-panel"
            ref={panelRef}
            role="dialog"
            aria-label="AI assistant"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed inset-0 z-40 flex flex-col bg-surface p-3 sm:inset-auto sm:bottom-24 sm:end-6 sm:h-[min(640px,calc(100dvh-11rem))] sm:w-[420px] sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-line pb-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stage text-brand-2" aria-hidden>
                <Sparkles size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{view === "history" ? "Conversations" : heading}</p>
                <p className="truncate text-[11px] text-muted">Procedures, cases and providers · with sources</p>
              </div>
              <HeaderButton label="Conversation history" pressed={view === "history"} onClick={() => setView(view === "history" ? "chat" : "history")}>
                <History size={16} />
              </HeaderButton>
              <HeaderButton label="New conversation" onClick={newConversation}>
                <SquarePen size={16} />
              </HeaderButton>
              <Link
                href="/assistant"
                aria-label="Open the full assistant page"
                title="Open the full page"
                className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-ink sm:flex"
              >
                <Maximize2 size={15} />
              </Link>
              <HeaderButton label="Close the assistant" onClick={() => setOpen(false)}>
                <X size={17} />
              </HeaderButton>
            </div>
            {view === "history" ? (
              <AssistantHistory className="mt-3 flex-1" />
            ) : (
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                <AssistantMessages compact />
                <VoiceBar />
                <div className="mt-3">
                  <AssistantComposer autoFocus />
                </div>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Close the AI assistant" : voiceOn ? "AI assistant (voice mode on)" : "Open the AI assistant"}
        title={voiceOn ? "AI assistant · voice on" : "AI assistant"}
        className={`fixed bottom-4 end-4 z-40 h-14 w-14 items-center justify-center rounded-full bg-stage text-white shadow-lg ring-1 ring-stage-line transition-transform duration-150 hover:scale-105 active:scale-95 sm:bottom-6 sm:end-6 ${
          open ? "hidden sm:flex" : "flex"
        }`}
      >
        {voiceOn ? <span className="animate-live-ping absolute inset-0 rounded-full bg-live/50" aria-hidden /> : null}
        <span className="absolute inset-[3px] rounded-full bg-gradient-to-br from-brand to-brand-2 opacity-90" aria-hidden />
        <span className="relative">{open ? <X size={22} /> : voiceOn ? <Sparkles size={22} /> : <MessageSquareText size={22} />}</span>
        {voiceOn && !open ? <span className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-live ring-2 ring-surface" aria-hidden /> : null}
      </button>
    </>
  );
}
