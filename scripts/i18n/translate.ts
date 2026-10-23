import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { dictionaryEntries } from "../../src/lib/i18n";
import { collectStrings } from "./strings";

// ---------------------------------------------------------------------------
// Translates the interface strings (see strings.ts) into the four interface
// languages once, with Claude, and writes them to src/lib/i18n-interface/*.json,
// which ship with the app so the translated interface works offline. Run it
// after adding interface text: it only translates strings that are new, and
// drops strings that are gone. The hand-written dictionary in src/lib/i18n.ts
// is the glossary, and wins wherever both have a string.
//
//   npm run i18n:translate          (needs AI_API_KEY or ANTHROPIC_API_KEY)
// ---------------------------------------------------------------------------

const LANGS = ["es", "fr", "pt", "ar"] as const;
type Lang = (typeof LANGS)[number];

const OUT_DIR = path.join(process.cwd(), "src/lib/i18n-interface");
const BATCH = 80;
const PARALLEL = 4;
const MODEL = "claude-opus-5-5";

function loadEnvKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (process.env.AI_API_KEY) return process.env.AI_API_KEY;
  const envFile = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envFile)) return undefined;
  const m = fs.readFileSync(envFile, "utf8").match(/^AI_API_KEY=["']?([^"'\r\n]+)/m);
  return m?.[1];
}

const readDictionary = (lang: Lang): Record<string, string> => {
  const file = path.join(OUT_DIR, `${lang}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
};

const Batch = z.object({
  items: z.array(
    z.object({
      i: z.number().int(),
      es: z.string(),
      fr: z.string(),
      pt: z.string(),
      ar: z.string(),
    })
  ),
});

const glossary = dictionaryEntries()
  .map(([en, [es, fr, pt, ar]]) => JSON.stringify({ en, es, fr, pt, ar }))
  .join("\n");

const SYSTEM = `You translate the interface of CareTrail, an AI workspace for travel health assistance companies (24/7 operations that arrange and pay for medical care for insured travellers abroad). Its users are case managers, medical officers, claims handlers and their managers. Screens cover cases, Letters of Guarantee (guarantees of payment, GOP), medical documents, claims and bill review, providers, voice agents and calls, receivables, partners, medical transport and air ambulances.

Translate each English interface string into:
- es: Spanish (neutral, as used across Latin America and Spain), formal "usted" where a person is addressed
- fr: French, "vous" where a person is addressed
- pt: Brazilian Portuguese
- ar: Modern Standard Arabic

Rules:
- These are interface strings: buttons, labels, headings, hints, short explanations, error messages. Match the register of professional software in that language: buttons and actions as infinitives in Spanish, French and Portuguese (as the glossary does), short and plain.
- Many strings are fragments of a longer sentence that the screen joins with a value (a name, a number, an amount). Translate a fragment as a fragment: keep its leading or trailing punctuation, keep it lower-case when it starts lower-case, and make it read naturally next to the value it was cut around.
- Keep unchanged: product and company names (CareTrail, Sthiram, CareTrack, WhatsApp, Twilio, Grok, Claude, Genesys), people's names, fictional company and hospital names, codes and abbreviations (API, SIP, PDF, OCR, CSV, EOB, MEDIF, ICD-10, CPT, GOP, KPI, SLA), currency codes, references such as CASE-1001 or CLM-10230, numbers, e-mail addresses, URLs, keyboard keys (⌘K, Esc) and symbols (…, →, ·, €).
- Place and language names take their usual name in the target language (Istanbul → Estambul, إسطنبول).
- In Arabic keep Latin abbreviations and product names in Latin script.
- Where the glossary has the English string or a term from it, use the glossary's wording so the interface stays consistent.
- A string that is not interface text (code, a CSS query, a file name) is returned unchanged in every language.

Glossary (JSON lines; English with the approved translations):
${glossary}`;

async function translateBatch(client: Anthropic, strings: string[]): Promise<Map<string, Record<Lang, string>>> {
  const payload = strings.map((en, i) => ({ i, en }));
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Translate every item. Return one entry per input item with the same "i".\n\n${JSON.stringify(payload, null, 0)}`,
      },
    ],
    output_config: { effort: "low", format: betaZodOutputFormat(Batch) },
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined the batch");
  if (res.stop_reason === "max_tokens") throw new Error("The batch's output was truncated");
  if (!res.parsed_output) throw new Error("The batch's output did not match the schema");
  const out = new Map<string, Record<Lang, string>>();
  for (const item of res.parsed_output.items) {
    const en = strings[item.i];
    if (en === undefined || LANGS.some((l) => !item[l].trim())) continue;
    out.set(en, { es: item.es.trim(), fr: item.fr.trim(), pt: item.pt.trim(), ar: item.ar.trim() });
  }
  return out;
}

/** Translates the strings in batches, retrying the ones a batch leaves out. */
async function translateAll(client: Anthropic, strings: string[]) {
  const done = new Map<string, Record<Lang, string>>();
  let todo = strings;
  for (let attempt = 1; todo.length && attempt <= 3; attempt++) {
    const batches: string[][] = [];
    for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        const n = next++;
        try {
          const got = await translateBatch(client, batches[n]);
          got.forEach((v, k) => done.set(k, v));
          console.log(`  batch ${n + 1}/${batches.length}: ${got.size}/${batches[n].length}`);
        } catch (e) {
          console.warn(`  batch ${n + 1}/${batches.length} failed: ${e instanceof Error ? e.message : e}`);
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    todo = todo.filter((s) => !done.has(s));
    if (todo.length) console.log(`${todo.length} strings left after attempt ${attempt}`);
  }
  return { done, missing: todo };
}

async function main() {
  const curated = new Set(dictionaryEntries().map(([en]) => en));
  const strings = collectStrings().filter((s) => !curated.has(s));
  const existing = Object.fromEntries(LANGS.map((l) => [l, readDictionary(l)])) as Record<Lang, Record<string, string>>;
  const todo = strings.filter((s) => LANGS.some((l) => !existing[l][s]));
  console.log(`${strings.length} interface strings, ${todo.length} to translate`);

  let translated = new Map<string, Record<Lang, string>>();
  if (todo.length) {
    const key = loadEnvKey();
    if (!key) throw new Error("Set AI_API_KEY (or ANTHROPIC_API_KEY) to translate new strings.");
    const client = new Anthropic({ apiKey: key, timeout: 300_000, maxRetries: 2 });
    const { done, missing } = await translateAll(client, todo);
    translated = done;
    if (missing.length) console.warn(`Not translated (shown in English): ${missing.join(" | ")}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const lang of LANGS) {
    const dict: Record<string, string> = {};
    for (const s of strings) {
      const value = translated.get(s)?.[lang] ?? existing[lang][s];
      if (value) dict[s] = value;
    }
    fs.writeFileSync(path.join(OUT_DIR, `${lang}.json`), JSON.stringify(dict, null, 1) + "\n");
  }
  console.log(`Wrote ${LANGS.map((l) => `${l}.json`).join(", ")} to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
