"use client";

import { useEffect } from "react";
import { useUiLanguage } from "@/components/i18n";
import { dictionaryEntries, directionOf, type UiLanguage } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// The rest of the interface in the chosen language. `<T>` covers the shell;
// this covers every other fixed string on screen: a text node (or a
// placeholder, title, aria-label or alt) whose text is an interface string is
// shown translated: whole, part by part around " · ", or a label before its
// value ("Policy number found (POL-…)"). Records never match, so they stay as
// written.
//
// The dictionaries (src/lib/i18n-interface, made by `npm run i18n:translate`)
// load only when a language other than English is chosen, so the English
// demo is untouched. Text nodes are changed in place, never replaced, and only
// once React has hydrated them, so React keeps owning the DOM; switching back
// to English restores every original.
// ---------------------------------------------------------------------------

type Lang = Exclude<UiLanguage, "en">;

const LOADERS: Record<Lang, () => Promise<{ default: Record<string, string> }>> = {
  es: () => import("@/lib/i18n-interface/es.json"),
  fr: () => import("@/lib/i18n-interface/fr.json"),
  pt: () => import("@/lib/i18n-interface/pt.json"),
  ar: () => import("@/lib/i18n-interface/ar.json"),
};

const COLUMN: Record<Lang, number> = { es: 0, fr: 1, pt: 2, ar: 3 };
const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];
const SKIP = "script,style,noscript,textarea,code,pre,[translate='no'],[data-no-translate],[contenteditable='true']";
/** Elements whose text is skipped but whose placeholder and title are still interface text. */
const TEXT_ONLY_SKIP = "textarea,code,pre";
/** "Policy number found (POL-…)", "Discharge summary — Lena Koch": the label is translated, the value kept. */
const LABEL_SEPARATORS = [": ", " (", " — "];
/** How long to wait for React to hydrate streamed content before translating it anyway. */
const HYDRATION_RETRIES = 20;

const keyOf = (s: string) => s.replace(/\s+/g, " ").trim();

/** The interface strings for a language: the generated ones, then the hand-written dictionary on top. */
async function loadLookup(lang: Lang): Promise<Map<string, string>> {
  const generated = (await LOADERS[lang]()).default;
  const lookup = new Map(Object.entries(generated));
  for (const [en, row] of dictionaryEntries()) lookup.set(en, row[COLUMN[lang]]);
  return lookup;
}

/** Whether React has taken over this node (translating earlier would break hydration). */
function hydrated(node: Node): boolean {
  const owned = (n: Node | null) => !!n && Object.keys(n).some((k) => k.startsWith("__reactFiber$"));
  return owned(node) || owned(node.parentNode);
}

/** Left-to-right isolates: a value kept as written (a reference, a phone number, an amount) keeps its own order inside Arabic. */
const ltr = (s: string) => (/[A-Za-z0-9]/.test(s) ? `\u2066${s}\u2069` : s);

/** Starts translating the page; the returned function stops and restores English. */
function startTranslating(lookup: Map<string, string>, rtl: boolean): () => void {
  const keep = rtl ? ltr : (s: string) => s;
  const texts = new Map<Text, { source: string; shown: string }>();
  const attrs = new Map<Element, Map<string, { source: string; shown: string }>>();
  const pending = new Map<Node, number>();
  let retryTimer: number | null = null;

  /** The text translated: whole, part by part around " · ", or its label before a value. */
  const translateKey = (key: string): string | null => {
    const out = lookup.get(key);
    if (out) return out === key ? null : out;
    if (key.includes(" · ")) {
      const parts = key.split(" · ");
      const outs = parts.map((p) => translateKey(p) ?? keep(p));
      return outs.some((o, i) => o !== parts[i] && o !== keep(parts[i])) ? outs.join(" · ") : null;
    }
    for (const sep of LABEL_SEPARATORS) {
      const at = key.indexOf(sep);
      const label = at > 0 ? lookup.get(key.slice(0, at)) : undefined;
      if (!label) continue;
      // "(POL-…)": the closing bracket stays outside the isolate, so it closes on the right side in Arabic.
      const rest = key.slice(at + sep.length);
      const close = sep === " (" && rest.endsWith(")") ? ")" : "";
      return label + sep + keep(close ? rest.slice(0, -1) : rest) + close;
    }
    // "Claim CLM-10230", "policy POL-CA-400101": the label before a reference.
    const ref = key.match(/^(.+?) ([A-Z]{2,}-[A-Z0-9-]*\d)$/);
    const label = ref ? lookup.get(ref[1]) : undefined;
    if (label) return `${label} ${keep(ref![2])}`;
    // "16 open", "€1,904 a case", "21 read by AI": a count or an amount before its label.
    const counted = key.match(/^((?:[A-Z]{0,3}[€$£])?\d[\d.,]*%?) (.+)$/);
    const after = counted ? lookup.get(counted[2]) : undefined;
    return after ? `${keep(counted![1])} ${after}` : null;
  };

  const translated = (value: string): string | null => {
    const key = keyOf(value);
    if (!key || !/[A-Za-z]/.test(key)) return null;
    const out = translateKey(key);
    if (!out) return null;
    return value.slice(0, value.length - value.trimStart().length) + out + value.slice(value.trimEnd().length);
  };

  /** Whether the node can be changed now; if React hasn't hydrated it yet, it's retried shortly. */
  const ready = (node: Node) => {
    if (hydrated(node) || (pending.get(node) ?? 0) >= HYDRATION_RETRIES) {
      pending.delete(node);
      return true;
    }
    pending.set(node, (pending.get(node) ?? 0) + 1);
    if (retryTimer === null) retryTimer = window.setTimeout(retryPending, 250);
    return false;
  };

  const visitText = (node: Text) => {
    const value = node.nodeValue ?? "";
    const record = texts.get(node);
    if (record && value === record.shown) return;
    const shown = translated(value);
    if (!shown) return void texts.delete(node);
    if (node.parentElement?.closest(SKIP)) return;
    if (!ready(node)) return;
    texts.set(node, { source: value, shown });
    node.nodeValue = shown;
  };

  const visitAttribute = (el: Element, name: string) => {
    const value = el.getAttribute(name);
    const records = attrs.get(el);
    const record = records?.get(name);
    if (value === null || (record && value === record.shown)) return;
    const shown = translated(value);
    if (!shown) return void records?.delete(name);
    if (!ready(el)) return;
    if (!records) attrs.set(el, new Map([[name, { source: value, shown }]]));
    else records.set(name, { source: value, shown });
    el.setAttribute(name, shown);
  };

  const visitElement = (el: Element) => {
    for (const name of ATTRIBUTES) if (el.hasAttribute(name)) visitAttribute(el, name);
  };

  /** A skipped element whose own attributes are still translated (a textarea's placeholder). */
  const attributesOnly = (el: Element) => el.matches(TEXT_ONLY_SKIP) && !el.parentElement?.closest(SKIP) && !el.matches("[translate='no'],[data-no-translate]");

  const scan = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) return visitText(root as Text);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    if ((root as Element).closest(SKIP)) {
      if (attributesOnly(root as Element)) visitElement(root as Element);
      return;
    }
    visitElement(root as Element);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.nodeType !== Node.ELEMENT_NODE || !(n as Element).matches(SKIP)) return NodeFilter.FILTER_ACCEPT;
        if (attributesOnly(n as Element)) visitElement(n as Element);
        return NodeFilter.FILTER_REJECT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) visitText(n as Text);
      else visitElement(n as Element);
    }
  };

  function retryPending() {
    retryTimer = null;
    for (const node of [...pending.keys()]) {
      if (!node.isConnected) pending.delete(node);
      else if (node.nodeType === Node.TEXT_NODE) visitText(node as Text);
      else visitElement(node as Element);
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "characterData") visitText(m.target as Text);
      else if (m.type === "attributes" && m.attributeName) visitAttribute(m.target as Element, m.attributeName);
      else m.addedNodes.forEach(scan);
    }
  });

  // Forget nodes that have left the page.
  const prune = window.setInterval(() => {
    for (const node of texts.keys()) if (!node.isConnected) texts.delete(node);
    for (const el of attrs.keys()) if (!el.isConnected) attrs.delete(el);
  }, 30_000);

  scan(document.body);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });

  return () => {
    observer.disconnect();
    window.clearInterval(prune);
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    for (const [node, { source, shown }] of texts) if (node.nodeValue === shown) node.nodeValue = source;
    for (const [el, records] of attrs) for (const [name, { source, shown }] of records) if (el.getAttribute(name) === shown) el.setAttribute(name, source);
  };
}

/** Mount once inside the language provider. */
export function InterfaceTranslator() {
  const { lang } = useUiLanguage();
  useEffect(() => {
    if (lang === "en") return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    loadLookup(lang)
      .then((lookup) => {
        if (!cancelled) stop = startTranslating(lookup, directionOf(lang) === "rtl");
      })
      .catch(() => undefined); // the interface stays in English
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [lang]);
  return null;
}
