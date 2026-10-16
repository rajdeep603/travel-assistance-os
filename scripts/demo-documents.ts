// ---------------------------------------------------------------------------
// The fictional demo documents the database seed files as processed records.
// The full definitions (and every other sample) live in scripts/samples/;
// this list is the seeded subset with the records each one belongs to.
// ALL CONTENT IS FICTIONAL DEMO DATA — no real people, hospitals or policies.
// ---------------------------------------------------------------------------

import { SAMPLE_DOCS } from "./samples/documents";
import type { SampleDoc } from "./samples/model";

export interface DemoDocumentDef extends NonNullable<SampleDoc["seed"]> {
  file: string;
}

export const DEMO_DOCUMENTS: DemoDocumentDef[] = SAMPLE_DOCS.flatMap((d) =>
  d.seed && d.dir === "demo-documents" ? [{ file: d.file, ...d.seed }] : []
);
