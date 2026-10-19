import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { INTAKE_REQUESTS, QUICK_SAMPLE_REQUEST } from "./intake-requests";

// ---------------------------------------------------------------------------
// The demo's own sample files and requests, recognised by content. With a live
// model configured they still run on the offline rules (withOfflineAI), so the
// figures a presenter has rehearsed (a bill review's saving, a guarantee's
// amount) never drift. Anything else, such as a visitor's own document, goes
// to the live model.
// ---------------------------------------------------------------------------

/** Folders under public/ that hold bundled samples. */
const SAMPLE_DIRS = ["demo-documents", "demo-inbound", "samples"];

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : Promise.resolve([path.join(dir, e.name)])))
  );
  return nested.flat();
}

let fingerprints: Promise<Set<string>> | null = null;

function load(): Promise<Set<string>> {
  fingerprints ??= (async () => {
    const root = path.join(process.cwd(), "public");
    const set = new Set<string>();
    for (const file of (await Promise.all(SAMPLE_DIRS.map((d) => filesUnder(path.join(root, d))))).flat()) {
      set.add(sha256(await fs.readFile(file)));
    }
    for (const text of [QUICK_SAMPLE_REQUEST, ...INTAKE_REQUESTS.map((r) => r.text)]) set.add(sha256(normalise(text)));
    return set;
  })();
  return fingerprints;
}

/** Whether these bytes are one of the bundled sample files (renamed or not). */
export async function isSampleFile(buffer: Buffer): Promise<boolean> {
  return (await load()).has(sha256(buffer));
}

/** Whether this text is one of the bundled case-intake requests, ignoring whitespace. */
export async function isSampleRequest(text: string): Promise<boolean> {
  return (await load()).has(sha256(normalise(text)));
}
