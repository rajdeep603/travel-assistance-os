import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { BRAND } from "../../src/lib/brand";

// ---------------------------------------------------------------------------
// Every fixed interface string in the workspace: JSX text, prose attributes
// (placeholder, title, aria-label…), capitalised string literals in
// components, and the label-like properties of the lib modules that feed the
// screens (agent labels, scenario titles, status labels). Records are not
// here: they come from the database and stay in their own language.
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const COMPONENT_DIRS = ["src/app", "src/components"];
const LIB_DIRS = ["src/lib"];

/**
 * Lib modules whose text is shown on screen as it is (scenario cards, agent
 * guardrails, step labels, checks and their reasons): every prose literal in
 * them is collected. Elsewhere in lib only label-like properties are, so
 * prompts, mock AI output, e-mail replies and PDF wording stay out.
 */
const SCREEN_LIB_FILES = [
  "src/lib/voice/demo-scenarios.ts",
  "src/lib/voice/call-scripts.ts",
  "src/lib/services/nlu.ts",
  "src/lib/voice/agents/",
  "src/lib/voice/tool-labels.ts",
  "src/lib/voice/client/use-grok-voice.ts",
  "src/lib/services/transport.ts",
  "src/lib/services/transport-plans.ts",
  "src/lib/services/air-ambulance.ts",
  "src/lib/services/claims.ts",
  "src/lib/services/settlement.ts",
  "src/lib/services/receivables.ts",
  "src/lib/services/network.ts",
  "src/lib/services/provider-network.ts",
  "src/lib/services/guarantee-decision.ts",
  "src/lib/services/leads.ts",
  "src/lib/services/lead-meetings.ts",
  "src/lib/pilots.ts",
  "src/lib/business-case.ts",
  "src/lib/services/tariff.ts",
  "src/lib/time-zone.ts",
  "src/lib/format.ts",
  "src/lib/services/dashboard.ts",
  "src/lib/sla.ts",
  "src/lib/services/service-levels.ts",
  "src/lib/cost-benchmarks.ts",
  "src/lib/dashboard-series.ts",
];

/** Screen modules whose lower-case strings are keywords to match, not text to show. */
const KEYWORD_FILES = ["src/lib/services/nlu.ts", "src/lib/services/tariff.ts"];

/** Words that mark a lower-case string as CSS classes rather than text. */
const CSS_WORDS = new Set("flex grid block inline hidden relative absolute fixed sticky static truncate underline italic uppercase lowercase capitalize contents isolate grow shrink border rounded shadow transition ring outline invisible visible peer group container prose antialiased tabular-nums".split(" "));

/** Properties in lib modules whose string values reach the screen. */
const LABEL_KEYS = new Set([
  "label",
  "shortLabel",
  "title",
  "description",
  "hint",
  "subtitle",
  "placeholder",
  "heading",
  "caption",
  "short",
  "detail",
  "cta",
  "tagline",
  "blurb",
  "help",
  "intro",
]);

/** JSX attributes that never hold interface text. */
const CODE_ATTRIBUTES = new Set([
  "className",
  "href",
  "src",
  "id",
  "key",
  "type",
  "name",
  "value",
  "defaultValue",
  "variant",
  "size",
  "tone",
  "method",
  "action",
  "target",
  "rel",
  "role",
  "htmlFor",
  "autoComplete",
  "inputMode",
  "pattern",
  "accept",
  "lang",
  "dir",
  "as",
  "icon",
  "state",
  "status",
  "kind",
  "format",
  "download",
  "data-testid",
]);

const ENTITIES: Record<string, string> = { apos: "'", quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", middot: "·", rarr: "→", larr: "←", mdash: "—", ndash: "–" };

const decode = (s: string) => s.replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m));

/** The lookup key for a piece of text: whitespace collapsed and trimmed. */
export const keyOf = (s: string) => s.replace(/\s+/g, " ").trim();

/** JSX text as React renders it: lines trimmed and joined with single spaces. */
function jsxText(raw: string): string {
  const lines = raw.split(/\r?\n/);
  if (lines.length === 1) return raw;
  return lines
    .map((l, i) => (i === 0 ? l.trimEnd() : i === lines.length - 1 ? l.trimStart() : l.trim()))
    .filter(Boolean)
    .join(" ");
}

const hasWord = (s: string) => /[A-Za-z]{2}/.test(s);

/** A string literal that reads as interface text rather than code. */
function isProse(s: string): boolean {
  if (s.length < 2 || s.length > 400 || !hasWord(s)) return false;
  if (/^(\/|https?:|#|@|\.|mailto:|tel:|data:)/.test(s)) return false;
  if (!/^[A-Z¿¡"“(]/.test(s) && !/^\d[\d/.,:%–-]*\s+[A-Za-z]/.test(s)) return false; // or "24/7 assistance hotline"
  if (/^[A-Z0-9_]+$/.test(s)) return false; // enum values, currencies
  if (!s.includes(" ") && /[a-z][A-Z]|[_./=]|^[A-Z][a-z]+-[A-Z]/.test(s)) return false; // identifiers, headers, files
  if (/[{}]|=>|\n/.test(s)) return false;
  if (/^[Mm]-?\d/.test(s)) return false; // SVG paths
  return true;
}

/** A lower-case phrase of plain words (", with urgency and place set"), not classes or identifiers. */
function isLowerPhrase(s: string): boolean {
  if (s.length > 200 || !/^[a-z,·(]/.test(s) || !s.includes(" ")) return false;
  const words = s.split(" ").filter(Boolean);
  const classLike = words.filter((w) => /^[a-z]+[-:][a-z0-9]/.test(w)).length;
  return (
    words.every((w) => /^[A-Za-z'’(),.·:;!?€%0-9/-]+$/.test(w) && !CSS_WORDS.has(w)) &&
    classLike * 2 < words.length && // "text-sm text-muted" vs "first-year value of quoted leads"
    words.some((w) => /^[a-z]{4,}/.test(w))
  );
}

function walkFiles(dir: string, exts: string[]): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(rel, exts));
    else if (exts.some((e) => entry.name.endsWith(e)) && !entry.name.endsWith(".d.ts")) out.push(rel);
  }
  return out;
}

function propertyName(node: ts.Node): string | null {
  if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) return node.name.text;
  return null;
}

function attributeName(node: ts.Node): string | null {
  if (ts.isJsxAttribute(node)) return node.name.getText();
  return null;
}

/** A template literal whose only values are BRAND constants, as it renders; null otherwise. */
function brandTemplate(node: ts.TemplateExpression): string | null {
  let out = node.head.text;
  for (const span of node.templateSpans) {
    const e = span.expression;
    if (!ts.isPropertyAccessExpression(e) || e.expression.getText() !== "BRAND" || !(e.name.text in BRAND)) return null;
    out += BRAND[e.name.text as keyof typeof BRAND] + span.literal.text;
  }
  return out;
}

/** Whether a literal is rendered as a JSX child, directly or as a branch of `a ? "x" : "y"` / `a || "x"`. */
function isJsxChild(node: ts.Node): boolean {
  let n = node.parent;
  while (n && (ts.isConditionalExpression(n) || ts.isParenthesizedExpression(n) || (ts.isBinaryExpression(n) && n.left !== node))) {
    if (ts.isConditionalExpression(n) && n.condition === node) return false;
    node = n;
    n = n.parent;
  }
  return !!n && ts.isJsxExpression(n) && !ts.isJsxAttribute(n.parent);
}

function collectFile(rel: string, isComponent: boolean, add: (s: string) => void) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const s = keyOf(decode(jsxText(node.text)));
      if (hasWord(s)) add(s);
    } else if (ts.isTemplateExpression(node) && brandTemplate(node) === null && isComponent) {
      // `Policy number found (${ref})`, `Claim ${ref}`: the translator matches the label before the value.
      const labelOnly = node.templateSpans.length === 1 && node.templateSpans[0].literal.text === "";
      const head = keyOf(node.head.text).match(/^(.+?)(?::| \(| —)$/)?.[1] ?? (labelOnly && /^\S+ $/.test(node.head.text) ? keyOf(node.head.text) : null);
      if (head && isProse(head)) add(head);
      // `${n} open`, `${n} read by AI`: a count before its label; the translator matches the label after the number.
      const tail = node.templateSpans.length === 1 && node.head.text === "" ? node.templateSpans[0].literal.text : "";
      // Units ("12 min ago", "3 h") read as they are; command keywords aren't shown.
      const unit = /^ (h|min|m|s|km|days?)\b/.test(tail);
      const keywords = propertyName(node.parent) === "keywords";
      if (!unit && !keywords && /^ [a-z][a-z' ]*[a-z]$/i.test(tail) && hasWord(tail)) add(keyOf(tail));
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || (ts.isTemplateExpression(node) && brandTemplate(node) !== null)) {
      const s = keyOf(ts.isTemplateExpression(node) ? brandTemplate(node)! : node.text);
      const parent = node.parent;
      const attr = attributeName(parent) ?? (parent && ts.isJsxExpression(parent) ? attributeName(parent.parent) : null);
      if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent) || ts.isExpressionStatement(parent) || /\w\(/.test(s)) {
        // module specifiers, directives ("use client"), CSS functions
      } else if (attr) {
        if (!CODE_ATTRIBUTES.has(attr) && !attr.startsWith("on") && hasWord(s) && isProse(s)) add(s);
      } else if (ts.isCallExpression(parent) && /missingInfo\.push$/.test(parent.expression.getText())) {
        // The offline AI's fixed missing-information notes, shown on documents and claims.
        if (isProse(s)) add(s);
      } else if (isComponent) {
        if (isProse(s) || (!KEYWORD_FILES.includes(rel) && isLowerPhrase(s)) || (isJsxChild(node) && hasWord(s) && !/[{};<>]|=>/.test(s))) add(s);
      } else {
        const key = propertyName(parent);
        if (key && LABEL_KEYS.has(key) && isProse(s)) add(s);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** Every interface string, sorted, with no duplicates. */
export function collectStrings(): string[] {
  const found = new Set<string>();
  const add = (s: string) => found.add(s);
  for (const dir of COMPONENT_DIRS) {
    for (const rel of walkFiles(dir, [".tsx"])) collectFile(rel, true, add);
    // Route handlers return errors the screens show; keep only their messages.
    for (const rel of walkFiles(dir, [".ts"])) collectFile(rel, false, add);
  }
  for (const dir of LIB_DIRS) {
    for (const rel of walkFiles(dir, [".ts", ".tsx"])) {
      const onScreen = rel.endsWith(".tsx") || SCREEN_LIB_FILES.some((f) => rel.startsWith(f));
      collectFile(rel, onScreen, add);
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const strings = collectStrings();
  console.log(JSON.stringify(strings, null, 1));
  console.error(`${strings.length} strings`);
}
