import { z } from "zod";
import { prisma } from "@/lib/db";
import { MEETING_IMPORT_COLUMNS, MEETING_IMPORT_TIME_ZONE } from "@/lib/lead-sources";
import { LEAD_SEGMENTS } from "@/lib/meeting-notes";
import { isUniqueViolation, nextRef, syncRefSequences } from "@/lib/refs";
import { wallClockToUtc } from "@/lib/time-zone";
import { NO_QUOTATION, contactInput, findLeadFor } from "./leads";

// ---------------------------------------------------------------------------
// Booked meetings: the presenter's list of meetings at the show, imported from
// a CSV with a brief for each, so /leads opens on the day's meetings in order
// and each lead on its preparation. Every row is checked before anything is
// written: one bad row and nothing is imported. Importing the list again
// updates the same leads rather than adding them twice. Nothing here records
// consent to e-mail.
// ---------------------------------------------------------------------------

export const MAX_IMPORT_ROWS = 500;

/** A filled-in example, so the first file comes out right. A fictional person on a reserved domain. */
export const MEETINGS_TEMPLATE =
  "﻿" +
  [
    MEETING_IMPORT_COLUMNS.join(","),
    'Jane Example,Example Assistance Ltd,jane@example.com,+44 20 7946 0000,Head of operations,assistance,2026-11-02 10:30,"Runs a 24/7 desk in three languages.\nProbe: night-shift volume.\nShow: the hotline call, then the bill review."',
  ].join("\r\n") +
  "\r\n";

/**
 * Rows of a CSV file as Excel, Numbers and Sheets write it: quoted cells may
 * hold commas, quotes ("") and line breaks; a byte-order mark is ignored. A
 * header without commas but with semicolons (Excel in much of Europe) sets
 * the semicolon as the separator.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const separator = !firstLine.includes(",") && firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (src[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && !cell.trim()) {
      quoted = true;
      cell = "";
    } else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * A meeting time from the list: "2026-11-02 14:30" on the show's clock
 * (Istanbul), or an instant with its offset ("2026-11-02T11:30:00Z",
 * "…+03:00"). Null when it is neither.
 */
export function parseMeetingAt(value: string): Date | null {
  const v = value.trim();
  const wall = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (wall) {
    const at = wallClockToUtc(wall[1], `${wall[2].padStart(2, "0")}:${wall[3]}`, MEETING_IMPORT_TIME_ZONE);
    return Number.isNaN(at.getTime()) ? null : at;
  }
  const instant = v.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:?\d{2})$/i);
  if (!instant) return null;
  const offset = instant[2].toUpperCase() === "Z" ? "Z" : instant[2].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  const at = new Date(`${instant[1]}${offset}`);
  return Number.isNaN(at.getTime()) ? null : at;
}

const segmentOf = (value: string) => {
  const v = value.trim().toLowerCase();
  return LEAD_SEGMENTS.find((s) => s.id === v || s.label.toLowerCase() === v)?.id;
};

/** Optional text: trimmed, empty → null. */
const optional = (column: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${column} is longer than ${max} characters`)
    .transform((v) => v || null);

const MeetingRowSchema = z.object({
  customerName: z.string().trim().min(2, "customerName (the person's name) is missing").max(120, "customerName is longer than 120 characters"),
  companyName: z.string().trim().min(2, "companyName is missing").max(120, "companyName is longer than 120 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => !v || (v.length <= 200 && z.email().safeParse(v).success), "email isn't an e-mail address")
    .transform((v) => v || null),
  phone: optional("phone", 40),
  role: optional("role", 120),
  segment: z
    .string()
    .refine((v) => !v.trim() || segmentOf(v), `segment isn't one of: ${LEAD_SEGMENTS.map((s) => s.id).join(", ")}`)
    .transform((v) => segmentOf(v) ?? null),
  meetingAt: z
    .string()
    .refine((v) => !v.trim() || parseMeetingAt(v), `meetingAt isn't a time: use YYYY-MM-DD HH:MM (Istanbul time) or an ISO date-time with its offset`)
    .transform((v) => (v.trim() ? parseMeetingAt(v) : null)),
  brief: optional("brief", 4000),
});

export type MeetingRow = z.infer<typeof MeetingRowSchema>;

/** A problem with the file, by its row as a spreadsheet numbers it (the header is row 1). */
export interface ImportRowError {
  row: number;
  message: string;
}

/** The column a header names, forgiving case, spaces and underscores ("Meeting at" → meetingAt). */
const columnOf = (header: string) => {
  const key = header.trim().toLowerCase().replace(/[\s_-]/g, "");
  return MEETING_IMPORT_COLUMNS.find((c) => c.toLowerCase() === key);
};

/** Reads and checks every row of a meetings CSV; errors name their row. */
export function readMeetingsCsv(text: string): { rows: MeetingRow[]; errors: ImportRowError[] } {
  const table = parseCsv(text);
  const header = table[0] ?? [];
  const errors: ImportRowError[] = [];
  const columns = header.map(columnOf);
  header.forEach((h, i) => {
    if (!h.trim()) return;
    if (!columns[i]) errors.push({ row: 1, message: `Unknown column "${h.trim()}". The columns are: ${MEETING_IMPORT_COLUMNS.join(", ")}.` });
    else if (columns.indexOf(columns[i]) !== i) errors.push({ row: 1, message: `The column ${columns[i]} appears twice.` });
  });
  for (const required of ["customerName", "companyName"] as const) {
    if (!columns.includes(required)) errors.push({ row: 1, message: `The header row needs a ${required} column.` });
  }
  if (errors.length) return { rows: [], errors };

  const rows: MeetingRow[] = [];
  const seen = new Map<string, number>();
  table.slice(1).forEach((cells, i) => {
    const row = i + 2;
    // Spreadsheets leave empty rows at the end.
    if (cells.every((c) => !c.trim())) return;
    const record = Object.fromEntries(MEETING_IMPORT_COLUMNS.map((c) => [c, ""])) as Record<(typeof MEETING_IMPORT_COLUMNS)[number], string>;
    cells.forEach((value, c) => {
      const column = columns[c];
      if (column) record[column] = value;
    });
    const parsed = MeetingRowSchema.safeParse(record);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push({ row, message: issue.message });
      return;
    }
    const m = parsed.data;
    const key = m.email ? `e-mail ${m.email}` : `company and name ${m.companyName.toLowerCase()} / ${m.customerName.toLowerCase()}`;
    const first = seen.get(key);
    if (first) errors.push({ row, message: `The same ${m.email ? "e-mail address" : "company and name"} as row ${first}.` });
    else seen.set(key, row);
    rows.push(m);
  });
  if (!rows.length && !errors.length) errors.push({ row: 2, message: "The file has no meetings in it." });
  if (rows.length > MAX_IMPORT_ROWS) errors.push({ row: MAX_IMPORT_ROWS + 2, message: `Import at most ${MAX_IMPORT_ROWS} meetings at a time.` });
  return { rows, errors };
}

/** Writes checked rows in one transaction: the lead they match is updated, the rest are created. */
async function writeMeetings(rows: MeetingRow[], operator: string | null): Promise<{ created: number; updated: number }> {
  return prisma.$transaction(
    async (tx) => {
      let created = 0;
      let updated = 0;
      for (const m of rows) {
        const found = await findLeadFor({ email: m.email, companyName: m.companyName, customerName: m.customerName }, tx);
        if (found) {
          // What the list says is kept; a blank cell doesn't blank what the lead has.
          await tx.lead.update({
            where: { id: found.id },
            data: {
              customerName: m.customerName,
              companyName: m.companyName,
              email: m.email ?? undefined,
              phone: m.phone ?? undefined,
              role: m.role ?? undefined,
              segment: m.segment ?? undefined,
              meetingAt: m.meetingAt ?? undefined,
              brief: m.brief ?? undefined,
            },
          });
          updated++;
        } else {
          await tx.lead.create({
            data: {
              ref: await nextRef("lead", tx),
              source: "MEETING",
              ...NO_QUOTATION,
              customerName: m.customerName,
              companyName: m.companyName,
              email: m.email,
              phone: m.phone,
              role: m.role,
              segment: m.segment,
              meetingAt: m.meetingAt,
              brief: m.brief,
              input: contactInput({ name: m.customerName, company: m.companyName, email: m.email, phone: m.phone }),
              createdBy: operator,
            },
          });
          created++;
        }
      }
      return { created, updated };
    },
    { timeout: 30_000 }
  );
}

export type ImportResult = { ok: true; created: number; updated: number } | { ok: false; errors: ImportRowError[] };

/** Imports a meetings CSV: all of it, or, if any row is wrong, none of it. */
export async function importMeetings(text: string, operator: string | null): Promise<ImportResult> {
  const { rows, errors } = readMeetingsCsv(text);
  if (errors.length) return { ok: false, errors };
  try {
    return { ok: true, ...(await writeMeetings(rows, operator)) };
  } catch (err) {
    // A ref the sequence handed out was taken (a manual insert got ahead of it): re-sync and go again, once.
    if (!isUniqueViolation(err, "ref")) throw err;
    await syncRefSequences();
    return { ok: true, ...(await writeMeetings(rows, operator)) };
  }
}
