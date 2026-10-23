// ---------------------------------------------------------------------------
// The shape of a fictional sample document. Plain data only: the database seed
// imports these definitions, so nothing here may pull in pdfkit or canvas.
//
// Offline extraction reads "Label: value" lines (src/lib/services/ai/mock.ts),
// so every field is drawn as a label and a value on one line, with nothing
// else on that line. The renderer checks that values fit without wrapping.
// ---------------------------------------------------------------------------

export interface Issuer {
  name: string;
  tagline: string;
  address: [string, string];
  phone: string;
  fax: string;
  email: string;
  web: string;
  /** Brand colour for the letterhead, headings and table header. */
  color: string;
  /** Light background for boxes and the table header. */
  tint: string;
  logo: "cross" | "heart" | "joint" | "arc";
  /** Licence and tax line in the footer. */
  registry: string;
}

/** Drawn as "Label: value" on a line of its own. */
export type Field = [label: string, value: string];

export interface Column {
  label: string;
  /** Share of the table width. */
  width: number;
  align?: "left" | "right";
}

export interface Total {
  label: string;
  value: string;
  strong?: boolean;
}

export interface Stamp {
  /** Text around the ring (usually the issuer's name). */
  ring: string;
  /** One to three short lines in the middle. */
  center: string[];
  color: string;
}

export type Block =
  | { type: "fields"; title?: string; left: Field[]; right?: Field[]; split?: number; labelWidth?: number }
  | { type: "section"; heading: string; fields?: Field[]; text?: string[]; labelWidth?: number }
  | { type: "table"; heading?: string; columns: Column[]; rows: string[][]; totals?: Total[]; note?: string }
  | { type: "signature"; caption: string; name: string; role: string; place?: string; stamp?: Stamp; unsigned?: boolean }
  | { type: "text"; text: string[]; muted?: boolean }
  | { type: "rx" };

export interface SampleDoc {
  file: string;
  /** Folder under public/. */
  dir: string;
  lang: "en" | "tr" | "fr" | "es" | "pt";
  issuer: Issuer;
  title: string;
  subtitle?: string;
  /** Top right: document number, dates. */
  meta: Field[];
  blocks: Block[];
  /** Delivered as a fax: an image-only scan with no text layer. */
  fax?: { from: string; to: string; sentAt: string; station: string; handwritten?: boolean };
  /** Seeded into the database as a processed document (prisma/seed.ts). */
  seed?: {
    kind: "MEDICAL_REPORT" | "HOSPITAL_INVOICE" | "PRESCRIPTION" | "DISCHARGE_SUMMARY";
    patientRef: string;
    caseRef?: string;
    claimRef?: string;
  };
}
