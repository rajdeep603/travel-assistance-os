"use client";

import { useEffect } from "react";
import { History, SquarePen } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { AssistantComposer, AssistantHistory, AssistantMessages, VoiceBar } from "@/components/assistant/assistant-conversation";
import { NEW_TITLE, useAssistant } from "@/components/assistant/assistant-provider";

/**
 * The internal assistant full size: the same conversation, voice mode and
 * history as the floating panel, with the earlier conversations alongside.
 */
export default function AssistantPage() {
  const { view, setView, title, threadId, newConversation } = useAssistant();
  const showHistory = view === "history";
  // The chat first; the list sits alongside on wide screens.
  useEffect(() => setView("chat"), [setView]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Internal AI Assistant"
        subtitle="Answers from your operating procedures, cases and provider network, always with sources. Type, or switch on voice and ask out loud."
      />
      <div className="flex max-w-5xl gap-4">
        <Card className="hidden w-72 shrink-0 flex-col lg:flex lg:h-[66vh] lg:min-h-[480px]">
          <p className="mb-3 text-sm font-semibold text-ink">Conversations</p>
          <AssistantHistory className="flex-1" />
        </Card>

        <Card className="flex h-[66vh] min-h-[480px] min-w-0 flex-1 flex-col">
          <div className="mb-3 flex items-center gap-2 border-b border-line pb-3">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
              {showHistory ? "Conversations" : threadId && title !== NEW_TITLE ? title : "New conversation"}
            </p>
            <button
              type="button"
              onClick={() => setView(showHistory ? "chat" : "history")}
              aria-pressed={showHistory}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100 lg:hidden"
            >
              <History size={14} aria-hidden />
              History
            </button>
            <button
              type="button"
              onClick={newConversation}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100"
            >
              <SquarePen size={14} aria-hidden />
              New
            </button>
          </div>
          {showHistory ? (
            <AssistantHistory className="flex-1 lg:hidden" />
          ) : null}
          <div className={`min-h-0 flex-1 flex-col ${showHistory ? "hidden lg:flex" : "flex"}`}>
            <AssistantMessages />
            <VoiceBar />
            <div className="mt-3">
              <AssistantComposer />
            </div>
          </div>
        </Card>
      </div>

      <p className="mt-3 max-w-5xl text-xs text-slate-400">
        Answers come only from the knowledge base and platform records. The assistant does not give medical advice. Conversations are kept for you
        under History.
      </p>
    </div>
  );
}
