"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarClock,
  CornerDownLeft,
  FileCheck2,
  FileText,
  FolderKanban,
  Inbox,
  Loader2,
  Mic,
  Phone,
  Plane,
  Presentation,
  ReceiptText,
  Search,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { OPEN_ASSISTANT_EVENT, type OpenAssistantDetail } from "@/components/assistant/assistant-provider";
import { NAV_ITEMS } from "@/components/nav";
import { setPresentMode } from "@/lib/present-mode";
import type { SearchHit, SearchKind } from "@/lib/services/search";

// ---------------------------------------------------------------------------
// Command palette (⌘K / Ctrl K): jump to any module, start any voice agent,
// receive a sample e-mail or fax, toggle presentation mode, ask the AI
// assistant, or find any record (case, traveller, claim, call, message,
// guarantee, transport plan, document, appointment) by name or reference.
// ---------------------------------------------------------------------------

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  /** Extra words that match (synonyms). */
  keywords?: string;
  run: () => void | Promise<void>;
}

const KIND: Record<SearchKind, { group: string; icon: LucideIcon }> = {
  case: { group: "Cases", icon: FolderKanban },
  traveller: { group: "Travellers", icon: UserRound },
  claim: { group: "Claims", icon: ReceiptText },
  call: { group: "Calls", icon: Phone },
  message: { group: "Inbox", icon: Inbox },
  guarantee: { group: "Guarantees", icon: FileCheck2 },
  transport: { group: "Transport", icon: Plane },
  document: { group: "Documents", icon: FileText },
  appointment: { group: "Appointments", icon: CalendarClock },
};

/** Opens the palette from anywhere (a button, a page). */
export const OPEN_PALETTE_EVENT = "taap:command-palette";

const matches = (item: Item, words: string[]) => {
  const text = `${item.label} ${item.hint ?? ""} ${item.keywords ?? ""} ${item.group}`.toLowerCase();
  return words.every((w) => text.includes(w));
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ agentId: string; label: string; youPlay: string }[]>([]);
  const [samples, setSamples] = useState<{ emails: { id: string; label: string }[]; faxes: { id: string; label: string }[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const listId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    restoreFocus.current?.focus?.();
  }, []);

  // ⌘K / Ctrl K toggles; the header button and others fire OPEN_PALETTE_EVENT.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) restoreFocus.current = document.activeElement as HTMLElement | null;
          return !o;
        });
      }
    };
    const onOpen = () => {
      restoreFocus.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  // Voice agents and inbox samples, loaded the first time the palette opens.
  useEffect(() => {
    if (!open) return;
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    if (!agents.length) {
      fetch("/api/voice/agents")
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => b && setAgents(b.scenarios))
        .catch(() => undefined);
    }
    if (!samples) {
      fetch("/api/inbox/simulate")
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => b && setSamples(b))
        .catch(() => undefined);
    }
  }, [open, agents.length, samples]);

  // Records: searched on the server as you type.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((b) => setHits(b.hits ?? []))
        .catch(() => undefined)
        .finally(() => !controller.signal.aborted && setSearching(false));
    }, 140);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, open]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  const commands = useMemo<Item[]>(() => {
    const items: Item[] = NAV_ITEMS.map((n) => ({ id: `nav:${n.href}`, group: "Go to", label: n.label, icon: n.icon, run: () => go(n.href) }));
    for (const a of agents) {
      items.push({ id: `voice:${a.agentId}`, group: "Voice agents", label: a.label, hint: `You play: ${a.youPlay}`, icon: Mic, keywords: "voice call agent talk", run: () => go(`/voice?agent=${encodeURIComponent(a.agentId)}`) });
    }
    const receive = (kind: "email" | "fax", sample: string, label: string): Item => ({
      id: `sample:${kind}:${sample}`,
      group: "Inbox samples",
      label: `Receive: ${label}`,
      icon: Inbox,
      keywords: `${kind === "email" ? "e-mail email" : "fax"} sample demo inbox receive`,
      run: async () => {
        const res = await fetch("/api/inbox/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, sample }) });
        const body = res.ok ? await res.json() : null;
        go(body?.message?.id ? `/inbox?message=${body.message.id}` : "/inbox");
      },
    });
    for (const e of samples?.emails ?? []) items.push(receive("email", e.id, e.label));
    for (const f of samples?.faxes ?? []) items.push(receive("fax", f.id, f.label));
    const assistant = (detail: OpenAssistantDetail) => {
      close();
      window.dispatchEvent(new CustomEvent<OpenAssistantDetail>(OPEN_ASSISTANT_EVENT, { detail }));
    };
    items.push(
      { id: "action:assistant", group: "Actions", label: "Ask the AI assistant", hint: "Chat, with your history", icon: Sparkles, keywords: "assistant ai chat question help", run: () => assistant({}) },
      { id: "action:assistant-voice", group: "Actions", label: "Talk to the AI assistant", hint: "Voice mode", icon: Mic, keywords: "assistant ai voice talk speak", run: () => assistant({ voice: true }) }
    );
    items.push({
      id: "action:present",
      group: "Actions",
      label: "Toggle presentation mode",
      hint: "Larger text for projectors",
      icon: Presentation,
      keywords: "present projector big screen",
      run: () => {
        setPresentMode(document.documentElement.dataset.present !== "on");
        close();
      },
    });
    return items;
  }, [agents, samples, go, close]);

  const items = useMemo<Item[]>(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const found = hits.map<Item>((h) => ({
      id: `${h.kind}:${h.id}`,
      group: KIND[h.kind].group,
      label: h.title,
      hint: h.subtitle,
      icon: KIND[h.kind].icon,
      run: () => go(h.href),
    }));
    // With no query: modules, voice agents and actions (samples need a word).
    if (!words.length) return commands.filter((c) => c.group !== "Inbox samples");
    const cmds = commands.filter((c) => matches(c, words));
    // A command whose name starts like the query ("voi", "inbox") leads; records
    // come next, so Enter on a name opens the record, not a sample; the
    // commands that only mention the words come last.
    const leads = (c: Item) =>
      c.group !== "Inbox samples" && `${c.label} ${c.group}`.toLowerCase().split(/\s+/).some((w) => w.startsWith(words[0]));
    const strong = cmds.filter(leads);
    const weak = cmds.filter((c) => !leads(c));
    // An exact reference hit goes first of all.
    const exact = hits[0] && hits[0].ref.toUpperCase() === query.trim().toUpperCase() ? found.slice(0, 1) : [];
    // A question can go straight to the assistant.
    const question = query.trim();
    const askIt: Item[] =
      question.length >= 3 && !exact.length
        ? [
            {
              id: "assistant:ask",
              group: "Ask the AI assistant",
              label: `“${question}”`,
              hint: "Answer with sources",
              icon: Sparkles,
              run: () => {
                close();
                window.dispatchEvent(new CustomEvent<OpenAssistantDetail>(OPEN_ASSISTANT_EVENT, { detail: { question } }));
              },
            },
          ]
        : [];
    return [...exact, ...strong.slice(0, 12), ...found.slice(exact.length), ...weak.slice(0, 6), ...askIt];
  }, [query, hits, commands, go, close]);

  useEffect(() => setActive(0), [query, hits.length]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  async function run(item: Item | undefined) {
    if (!item || running) return;
    setRunning(item.id);
    try {
      await item.run();
    } finally {
      setRunning(null);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      setActive(0);
    } else if (e.key === "End") {
      setActive(Math.max(0, items.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void run(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // The dialog has one control; keep focus in it.
      e.preventDefault();
    }
  }

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="palette"
          data-command-palette
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search and commands"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              {searching ? <Loader2 size={18} className="shrink-0 animate-spin text-muted" aria-hidden /> : <Search size={18} className="shrink-0 text-muted" aria-hidden />}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cases, travellers, guarantees… or type a command"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
                aria-autocomplete="list"
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-muted focus:outline-none"
              />
              <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[11px] text-muted sm:inline">Esc</kbd>
            </div>
            <div ref={listRef} id={listId} role="listbox" aria-label="Results" className="max-h-[min(60vh,28rem)] overflow-y-auto py-2">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  {searching || query.trim().length < 2 ? "Type at least two letters to search records." : `Nothing matches “${query.trim()}”.`}
                </p>
              ) : (
                items.map((item, i) => {
                  const header = item.group !== lastGroup ? item.group : null;
                  lastGroup = item.group;
                  const Icon = item.icon;
                  const selected = i === active;
                  return (
                    <div key={item.id}>
                      {header ? <p className="px-4 pb-1 pt-3 text-xs font-medium text-muted first:pt-1">{header}</p> : null}
                      <div
                        id={`${listId}-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => setActive(i)}
                        onClick={() => void run(item)}
                        className={`mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${selected ? "bg-brand/10" : ""}`}
                      >
                        {running === item.id ? (
                          <Loader2 size={16} className="shrink-0 animate-spin text-brand" aria-hidden />
                        ) : (
                          <Icon size={16} className={`shrink-0 ${selected ? "text-brand" : "text-muted"}`} aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{item.label}</span>
                          {item.hint ? <span className="block truncate text-xs text-muted">{item.hint}</span> : null}
                        </span>
                        {selected ? <CornerDownLeft size={14} className="shrink-0 text-muted" aria-hidden /> : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-[11px] text-muted">
              <span>
                <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move · <kbd className="font-sans">Enter</kbd> to open
              </span>
              <span className="hidden sm:inline">Tip: type a reference like LOG-0902</span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** The header's search field: opens the palette, and shows the shortcut. */
export function SearchButton() {
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 text-sm text-muted transition-colors hover:border-brand/50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:w-64"
      aria-label="Search and commands"
      aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
    >
      <Search size={15} aria-hidden />
      <span className="hidden flex-1 text-left md:inline">Search or jump to…</span>
      <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] text-muted sm:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}
