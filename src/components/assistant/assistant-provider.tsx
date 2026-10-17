"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AssistantMessageDto, AssistantThreadSummary } from "@/lib/services/assistant-history";
import { ASSISTANT_AGENT_ID } from "@/lib/voice/agents/ids";
import { useGrokVoice, type TranscriptLine } from "@/lib/voice/client/use-grok-voice";

// ---------------------------------------------------------------------------
// The internal assistant's state, shared by the floating panel and the
// /assistant page: the open conversation, its history, and voice mode. It
// lives in the app layout, so a voice session keeps going while the
// operator (or the assistant, opening a record) moves between pages.
// ---------------------------------------------------------------------------

/** Opens the assistant from anywhere: `detail.voice` starts voice mode, `detail.question` asks. */
export const OPEN_ASSISTANT_EVENT = "taap:assistant";
export interface OpenAssistantDetail {
  voice?: boolean;
  question?: string;
}

export const NEW_TITLE = "New conversation";
const STORAGE_KEY = "caretrail.assistant.thread";

const readStored = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const store = (id: string | null) => {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private window or blocked storage: the conversation just isn't restored
  }
};
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

type View = "chat" | "history";

interface AssistantValue {
  open: boolean;
  setOpen(open: boolean): void;
  view: View;
  setView(view: View): void;
  threadId: string | null;
  title: string;
  messages: AssistantMessageDto[];
  /** Answers that arrived in this visit, written out word by word once. */
  fresh: ReadonlySet<string>;
  loading: boolean;
  busy: boolean;
  error: string | null;
  setError(error: string | null): void;
  draft: string;
  setDraft(draft: string): void;
  ask(question: string): Promise<void>;
  newConversation(): void;
  openThread(id: string): void;
  threads: AssistantThreadSummary[] | null;
  refreshThreads(): Promise<void>;
  removeThread(id: string): Promise<void>;
  voice: ReturnType<typeof useGrokVoice>;
  /** Voice mode is starting or live. */
  voiceOn: boolean;
  /** What was said in voice mode that isn't saved into `messages` yet. */
  liveLines: TranscriptLine[];
  startVoice(): void;
  stopVoice(): void;
  /** The last record the assistant opened on screen. */
  opened: { href: string; label: string } | null;
}

const AssistantContext = createContext<AssistantValue | null>(null);

export function useAssistant(): AssistantValue {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant needs <AssistantProvider>");
  return value;
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const onPage = pathname === "/assistant";

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [threadId, setThreadIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState(NEW_TITLE);
  const [messages, setMessages] = useState<AssistantMessageDto[]>([]);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [threads, setThreads] = useState<AssistantThreadSummary[] | null>(null);
  const [opened, setOpened] = useState<AssistantValue["opened"]>(null);
  const [voiceThreadId, setVoiceThreadId] = useState<string | null>(null);

  // The thread on screen, for async work that must not land in another one.
  const currentRef = useRef<string | null>(null);
  // The thread whose messages are loaded.
  const loadedRef = useRef<string | null>(null);

  const setThreadId = useCallback((id: string | null) => {
    currentRef.current = id;
    setThreadIdState(id);
    store(id);
  }, []);

  // The last conversation comes back after a reload.
  useEffect(() => {
    const stored = readStored();
    currentRef.current = stored;
    setThreadIdState(stored);
    setHydrated(true);
  }, []);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/assistant/threads/${encodeURIComponent(id)}`);
      if (currentRef.current !== id) return null;
      if (res.status === 404) {
        // Deleted (maybe in another tab): start afresh.
        if (!quiet) {
          setThreadId(null);
          setMessages([]);
          setTitle(NEW_TITLE);
        }
        return null;
      }
      if (!res.ok) throw new Error(String(res.status));
      const { thread } = (await res.json()) as { thread: { title: string; messages: AssistantMessageDto[] } };
      if (currentRef.current !== id) return null;
      loadedRef.current = id;
      setTitle(thread.title);
      setMessages(thread.messages);
      return thread;
    } catch {
      if (!quiet) setError("The conversation couldn't be loaded. Please try again.");
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [setThreadId]);

  // Load the conversation the first time the assistant is shown.
  const active = open || onPage;
  useEffect(() => {
    if (!active || !hydrated || !threadId || loadedRef.current === threadId) return;
    void loadThread(threadId);
  }, [active, hydrated, threadId, loadThread]);

  const refreshThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant/threads");
      if (res.ok) setThreads(((await res.json()) as { threads: AssistantThreadSummary[] }).threads);
    } catch {
      // the list stays as it was
    }
  }, []);

  // --- Voice mode -------------------------------------------------------------
  const voice = useGrokVoice();
  const { phase, callRef, transcript, navigate } = voice.state;
  const voiceOn = phase === "starting" || phase === "live";
  const { start: startSession, stop: stopSession, sendText } = voice;

  const startVoice = useCallback(() => {
    setError(null);
    setView("chat");
    const forThread = currentRef.current;
    setVoiceThreadId(forThread);
    // Called straight from the click, so the browser lets the agent's audio play.
    void startSession({ profile: ASSISTANT_AGENT_ID, threadId: forThread ?? undefined }).then((session) => {
      if (!session?.thread) return;
      setVoiceThreadId(session.thread.id);
      // Voice opened a new conversation.
      if (currentRef.current === forThread && !forThread) {
        loadedRef.current = session.thread.id;
        setThreadId(session.thread.id);
      }
    });
  }, [startSession, setThreadId]);

  const stopVoice = useCallback(() => stopSession(), [stopSession]);

  // When a voice session ends, its transcript is saved into the conversation:
  // reload until it's there, then the live lines give way to the saved ones.
  useEffect(() => {
    if ((phase !== "ended" && phase !== "error") || !voiceThreadId || !callRef || transcript.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < 6 && !cancelled; i++) {
        await wait(i === 0 ? 300 : 1000);
        if (cancelled || currentRef.current !== voiceThreadId) return;
        const thread = await loadThread(voiceThreadId, true);
        if (thread?.messages.some((m) => m.callRef === callRef)) {
          setThreads(null);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // transcript.length only gates the first run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, callRef, voiceThreadId, loadThread]);

  const liveLines = useMemo(() => {
    if (!callRef || voiceThreadId !== threadId || messages.some((m) => m.callRef === callRef)) return [];
    return transcript.filter((t) => t.text.trim());
  }, [callRef, voiceThreadId, threadId, messages, transcript]);

  // The assistant opened a record: show it. On a phone the panel covers the page, so it steps aside.
  useEffect(() => {
    if (!navigate) return;
    router.push(navigate.href);
    setOpened({ href: navigate.href, label: navigate.label });
    if (window.matchMedia("(max-width: 639px)").matches) setOpen(false);
    // a new navigate event has a new id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate?.id]);

  // The full page replaces the panel; the voice agents page has its own microphone session.
  useEffect(() => {
    if (pathname === "/assistant") setOpen(false);
    if (pathname.startsWith("/voice") && voiceOn) stopSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // --- Conversations --------------------------------------------------------------
  const newConversation = useCallback(() => {
    if (voiceOn) stopSession();
    setThreadId(null);
    loadedRef.current = null;
    setMessages([]);
    setTitle(NEW_TITLE);
    setError(null);
    setDraft("");
    setView("chat");
  }, [voiceOn, stopSession, setThreadId]);

  const openThread = useCallback(
    (id: string) => {
      setView("chat");
      if (id === currentRef.current) return;
      if (voiceOn) stopSession();
      setError(null);
      setMessages([]);
      setThreadId(id);
      loadedRef.current = null;
      void loadThread(id);
    },
    [voiceOn, stopSession, setThreadId, loadThread]
  );

  const removeThread = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/assistant/threads/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok && res?.status !== 404) {
        setError("The conversation couldn't be deleted. Please try again.");
        return;
      }
      setThreads((list) => list?.filter((t) => t.id !== id) ?? null);
      if (id === currentRef.current) {
        if (voiceOn) stopSession();
        setThreadId(null);
        loadedRef.current = null;
        setMessages([]);
        setTitle(NEW_TITLE);
      }
    },
    [voiceOn, stopSession, setThreadId]
  );

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      // In voice mode a typed question goes to the voice agent, which answers out loud.
      if (voiceOn) {
        sendText(q);
        setDraft("");
        return;
      }
      setError(null);
      setDraft("");
      setView("chat");
      const pendingId = `pending-${Date.now()}`;
      const forThread = currentRef.current;
      setMessages((m) => [
        ...m,
        { id: pendingId, role: "user", mode: "text", text: q, sources: [], aiSource: null, callRef: null, createdAt: new Date().toISOString() },
      ]);
      setBusy(true);
      try {
        const res = await fetch("/api/assistant/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, threadId: forThread }),
        });
        const body = await res.json().catch(() => null);
        if (currentRef.current !== forThread) return;
        if (!res.ok) {
          setMessages((m) => m.filter((x) => x.id !== pendingId));
          setDraft(q);
          if (res.status === 404 && forThread) {
            // The conversation was deleted elsewhere: ask again in a new one.
            setThreadId(null);
            setMessages([]);
            setTitle(NEW_TITLE);
            setError("That conversation was deleted. Press Ask again to start a new one.");
          } else {
            setError(body?.error?.message ?? "The assistant could not answer. Please try again.");
          }
          return;
        }
        const saved = body.messages as AssistantMessageDto[];
        loadedRef.current = body.thread.id;
        if (!forThread) setThreadId(body.thread.id);
        setTitle(body.thread.title);
        setMessages((m) => [...m.filter((x) => x.id !== pendingId), ...saved]);
        setFresh((f) => new Set(f).add(saved[saved.length - 1].id));
        setThreads(null);
      } catch {
        setMessages((m) => m.filter((x) => x.id !== pendingId));
        setDraft(q);
        setError("The assistant is unreachable. Please check your connection.");
      } finally {
        setBusy(false);
      }
    },
    [busy, voiceOn, sendText, setThreadId]
  );

  // Opened from the command palette or elsewhere.
  const latest = useRef({ ask, startVoice, voiceOn, onPage });
  latest.current = { ask, startVoice, voiceOn, onPage };
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenAssistantDetail | undefined>).detail ?? {};
      const now = latest.current;
      if (!now.onPage) setOpen(true);
      setView("chat");
      if (detail.question) void now.ask(detail.question);
      else if (detail.voice && !now.voiceOn) now.startVoice();
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, []);

  const value: AssistantValue = {
    open,
    setOpen,
    view,
    setView,
    threadId,
    title,
    messages,
    fresh,
    loading,
    busy,
    error,
    setError,
    draft,
    setDraft,
    ask,
    newConversation,
    openThread,
    threads,
    refreshThreads,
    removeThread,
    voice,
    voiceOn,
    liveLines,
    startVoice,
    stopVoice,
    opened,
  };
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
