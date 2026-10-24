// ---------------------------------------------------------------------------
// Keeps the shared demo current and tidy on a server that runs for weeks:
//
//  1. Tidy: removes the cases and calls the seed didn't create (test calls,
//     rehearsal cases) with what hangs off them, and the patients only they used.
//  2. Shift: moves the demo history forward by whole days, so the latest activity
//     lands as close to now as it can without passing it (Istanbul days), and
//     "last 7 days", the activity chart and the night shift show a live operation. Whole days keep every time of day (the
//     03:40 emergency, the 20:00-08:00 night shift). Dates written inside text and
//     JSON move too: ISO dates and spoken ones ("Monday 19 October").
//  3. Fixes: small data corrections for records already on a server.
//
// Never touched: visitor leads, the assistant's history, webhooks, birth dates.
// Dry run by default; `--apply` does it all in one transaction.
//
//   npm run demo:refresh                  # what it would do
//   npm run demo:refresh -- --apply       # do it
//   node demo-refresh.cjs --apply         # in the production image
// Options: --no-tidy, --no-shift; --age=N makes the history N days older (to
// rehearse a refresh, or in tests).
// ---------------------------------------------------------------------------

import { Prisma, PrismaClient } from "@prisma/client";
import { CASES, PATIENTS, seedCalls } from "../prisma/seed-data";
import { addDays, formatPlainDate, utcToZoned } from "../src/lib/time";

const DAY = 86_400_000;
/** Tables that hold real use, not demo history. */
const UNTOUCHED_TABLES = new Set(["Lead", "AssistantThread", "AssistantMessage", "WebhookEndpoint", "WebhookDelivery", "_prisma_migrations"]);
/** Date columns that are facts, not history. */
const UNTOUCHED_COLUMNS = new Set(["Patient.dateOfBirth"]);

type Tx = Prisma.TransactionClient;

export interface RefreshOptions {
  apply?: boolean;
  tidy?: boolean;
  shift?: boolean;
  now?: Date;
  /** Move the history this many days back instead of up to today. */
  ageDays?: number;
  log?: (line: string) => void;
}

export interface RefreshReport {
  removed: { cases: string[]; calls: string[]; patients: string[] };
  shiftDays: number;
  shiftedRows: number;
  fixes: string[];
}

const SEED_CASES = new Set(CASES.map((c) => c.ref));
const SEED_PATIENTS = new Set(PATIENTS.map((p) => p.ref));
const SEED_CALLS = new Set(seedCalls({ date: () => "2026-01-01", spoken: () => "" }).map((c) => c.ref));

// ---------------------------------------------------------------- tidy
async function tidy(tx: Tx, report: RefreshReport): Promise<void> {
  const cases = (await tx.case.findMany({ select: { id: true, ref: true } })).filter((c) => !SEED_CASES.has(c.ref));
  const caseIds = cases.map((c) => c.id);
  const calls = await tx.call.findMany({
    where: { OR: [{ ref: { notIn: [...SEED_CALLS] } }, { caseId: { in: caseIds } }] },
    select: { id: true, ref: true, conversationId: true },
  });
  report.removed.cases = cases.map((c) => c.ref);
  report.removed.calls = calls.map((c) => c.ref);

  const conversationIds = calls.map((c) => c.conversationId).filter((id): id is string => !!id);
  await tx.call.deleteMany({ where: { id: { in: calls.map((c) => c.id) } } });
  await tx.conversation.deleteMany({ where: { OR: [{ id: { in: conversationIds } }, { caseId: { in: caseIds } }] } });
  if (caseIds.length) {
    const claimIds = (await tx.claim.findMany({ where: { caseId: { in: caseIds } }, select: { id: true } })).map((c) => c.id);
    await tx.appointment.deleteMany({ where: { caseId: { in: caseIds } } });
    await tx.outboundMessage.deleteMany({ where: { caseId: { in: caseIds } } });
    await tx.guaranteeLetter.deleteMany({ where: { caseId: { in: caseIds } } });
    await tx.document.deleteMany({ where: { OR: [{ caseId: { in: caseIds } }, { claimId: { in: claimIds } }] } });
    await tx.claim.deleteMany({ where: { id: { in: claimIds } } });
    await tx.inboundMessage.updateMany({ where: { matchedCaseId: { in: caseIds } }, data: { matchedCaseId: null } });
    // Events, transport plans and partner hand-offs go with the case (cascade).
    await tx.case.deleteMany({ where: { id: { in: caseIds } } });
  }

  // Patients the tests created, once nothing refers to them.
  const extra = await tx.patient.findMany({
    where: { ref: { notIn: [...SEED_PATIENTS] } },
    select: { id: true, ref: true, policyNumber: true, _count: { select: { cases: true, claims: true, appointments: true, documents: true } } },
  });
  for (const p of extra) {
    const used = Object.values(p._count).some((n) => n > 0);
    const insured = p.policyNumber ? await tx.policy.count({ where: { number: p.policyNumber } }) : 0;
    if (used || insured) continue;
    await tx.patient.delete({ where: { id: p.id } });
    report.removed.patients.push(p.ref);
  }
}

// ---------------------------------------------------------------- shift
/** Whole days that bring the latest activity to today, Istanbul time, without passing now. */
export function shiftDaysFor(latest: Date, now: Date): number {
  let days = Math.round((Date.parse(utcToZoned(now).date) - Date.parse(utcToZoned(latest).date)) / DAY);
  if (latest.getTime() + days * DAY > now.getTime()) days -= 1;
  return Math.max(0, days);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_NAMES = `${MONTHS.join("|")}|${MONTHS.map((m) => m.slice(0, 3)).join("|")}`;
// Sticky patterns, tried in this order at each position of the text, so a date is moved once.
const ISO = /\b(20\d\d-\d\d-\d\d)(?=T|\b)/y;
// "Monday 19 October" (the seed's spoken form).
const SPOKEN = new RegExp(`\\b(${WEEKDAYS.join("|")}) (\\d{1,2}) (${MONTHS.join("|")})\\b`, "y");
// "30 September to 3 October": a range over two months.
const SPLIT_RANGE = new RegExp(`\\b(\\d{1,2}) (${MONTH_NAMES})( to |–)(\\d{1,2}) (${MONTH_NAMES})\\b`, "y");
// "20 October", "18 to 20 October", "22 Oct", "11 June 1969".
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:( to |–)(\\d{1,2}))? (${MONTH_NAMES})\\b(?: (\\d{4}))?`, "y");

const iso = (year: number, month: number, day: string | number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const monthOf = (name: string) => MONTHS.findIndex((m) => m === name || m.slice(0, 3) === name) + 1;
const dayOf = (date: string) => String(Number(date.slice(8, 10)));

/** Moves the dates written in a piece of text by `days`, if they fall inside [from, to]. */
export function shiftDatesInText(text: string, days: number, from: string, to: string): string {
  const inside = (d: string) => d >= from && d <= to;
  // Dates written without a year: the first year of the window that holds them.
  const years = [Number(from.slice(0, 4)), Number(to.slice(0, 4))];
  // "18 to 20 October" stays one month when it can; month names keep their length.
  const range = (start: string, end: string, sep: string, short: boolean) => {
    const name = (date: string) => MONTHS[Number(date.slice(5, 7)) - 1].slice(0, short ? 3 : undefined);
    const s = addDays(start, days), e = addDays(end, days);
    if (s === e) return `${dayOf(s)} ${name(s)}`;
    return s.slice(5, 7) === e.slice(5, 7) ? `${dayOf(s)}${sep}${dayOf(e)} ${name(e)}` : `${dayOf(s)} ${name(s)}${sep}${dayOf(e)} ${name(e)}`;
  };
  const short = (month: string) => month.length === 3 && month !== "May";

  const rules: [RegExp, (m: RegExpExecArray) => string | null][] = [
    [ISO, (m) => (inside(m[1]) ? addDays(m[1], days) : null)],
    [SPOKEN, ([, weekday, day, month]) => {
      for (const year of years) {
        const date = iso(year, monthOf(month), day);
        if (inside(date) && WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] === weekday) {
          return formatPlainDate(addDays(date, days), { weekday: "long", day: "numeric", month: "long" });
        }
      }
      return null;
    }],
    [SPLIT_RANGE, ([, d1, m1, sep, d2, m2]) => {
      for (const y of years) {
        const start = iso(y, monthOf(m1), d1), end = iso(monthOf(m2) < monthOf(m1) ? y + 1 : y, monthOf(m2), d2);
        if (inside(start) && inside(end)) return range(start, end, sep, short(m1));
      }
      return null;
    }],
    [DAY_MONTH, ([, d1, sep, d2, month, year]) => {
      for (const y of year ? [Number(year)] : years) {
        const start = iso(y, monthOf(month), d1), end = iso(y, monthOf(month), d2 ?? d1);
        if (inside(start) && inside(end)) return range(start, end, sep ?? "", short(month)) + (year ? ` ${addDays(end, days).slice(0, 4)}` : "");
      }
      return null;
    }],
  ];

  let out = "";
  let i = 0;
  scan: while (i < text.length) {
    for (const [pattern, move] of rules) {
      pattern.lastIndex = i;
      const m = pattern.exec(text);
      const moved = m && move(m);
      if (m && moved !== null) {
        out += moved;
        i = pattern.lastIndex;
        continue scan;
      }
    }
    out += text[i++];
  }
  return out;
}

interface Column {
  table: string;
  column: string;
  type: string;
}

/** Where things happen; the latest of them (up to now: appointments lie ahead) anchors the move. */
const ACTIVITY: [string, string][] = [
  ["Call", "startedAt"], ["Case", "createdAt"], ["CaseEvent", "createdAt"], ["InboundMessage", "receivedAt"],
  ["OutboundMessage", "createdAt"], ["Claim", "createdAt"], ["Document", "createdAt"], ["GuaranteeLetter", "createdAt"],
];

async function shift(tx: Tx, now: Date, ageDays: number | undefined, report: RefreshReport, log: (l: string) => void): Promise<void> {
  const [latest] = await tx.$queryRawUnsafe<{ at: Date | null }[]>(
    `SELECT max(at) AS at FROM (${ACTIVITY.map(([t, c]) => `SELECT max("${c}") AS at FROM "${t}" WHERE "${c}" <= $1`).join(" UNION ALL ")}) a`,
    now
  );
  if (!latest?.at) return log("No activity: nothing to move.");
  const days = ageDays ? -ageDays : shiftDaysFor(latest.at, now);
  report.shiftDays = days;
  log(`Latest activity ${latest.at.toISOString()}: moving the demo history ${days} day(s).`);
  if (!days) return;

  const columns = (
    await tx.$queryRaw<Column[]>`
      SELECT table_name AS "table", column_name AS "column", data_type AS "type"
      FROM information_schema.columns WHERE table_schema = 'public'`
  ).filter((c) => !UNTOUCHED_TABLES.has(c.table) && !UNTOUCHED_COLUMNS.has(`${c.table}.${c.column}`));

  // Text dates move only inside the demo's own span, so birth dates and policy
  // wordings stay as written.
  const [span] = await tx.$queryRaw<{ first: Date }[]>`SELECT min("createdAt") AS first FROM "Case"`;
  const from = addDays(utcToZoned(span?.first ?? latest.at).date, -60);
  const to = addDays(utcToZoned(latest.at).date, 500);

  for (const c of columns.filter((c) => c.type.startsWith("timestamp") || c.type === "date")) {
    const n = await tx.$executeRawUnsafe(
      `UPDATE "${c.table}" SET "${c.column}" = "${c.column}" + make_interval(days => $1::int) WHERE "${c.column}" IS NOT NULL`,
      days
    );
    report.shiftedRows += n;
  }
  for (const c of columns.filter((c) => c.type === "text" || c.type === "jsonb" || c.type === "character varying")) {
    if (!columns.some((x) => x.table === c.table && x.column === "id")) continue;
    const rows = await tx.$queryRawUnsafe<{ id: string; value: string }[]>(
      `SELECT id, "${c.column}"::text AS value FROM "${c.table}"
       WHERE "${c.column}"::text ~ '20[0-9]{2}-[0-9]{2}-[0-9]{2}|[0-9] (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'`
    );
    for (const row of rows) {
      const moved = shiftDatesInText(row.value, days, from, to);
      if (moved === row.value) continue;
      await tx.$executeRawUnsafe(`UPDATE "${c.table}" SET "${c.column}" = $1${c.type === "jsonb" ? "::jsonb" : ""} WHERE id = $2`, moved, row.id);
      report.shiftedRows += 1;
    }
  }
}

// ---------------------------------------------------------------- fixes
async function fixes(tx: Tx, report: RefreshReport): Promise<void> {
  // CALL-0918 marks CASE-1023 urgent; servers seeded before the fix still show Medium.
  const n = await tx.case.updateMany({ where: { ref: "CASE-1023", priority: "MEDIUM" }, data: { priority: "HIGH" } });
  if (n.count) report.fixes.push("CASE-1023 priority Medium → High");
}

export async function refreshDemo(prisma: PrismaClient, opts: RefreshOptions = {}): Promise<RefreshReport> {
  const { apply = false, tidy: doTidy = true, shift: doShift = true, now = new Date(), ageDays, log = console.log } = opts;
  const report: RefreshReport = { removed: { cases: [], calls: [], patients: [] }, shiftDays: 0, shiftedRows: 0, fixes: [] };
  const DRY_RUN = new Error("dry run");
  try {
    await prisma.$transaction(
      async (tx) => {
        if (doTidy) await tidy(tx, report);
        if (doShift) await shift(tx, now, ageDays, report, log);
        await fixes(tx, report);
        // A dry run does everything, reports, then rolls back.
        if (!apply) throw DRY_RUN;
      },
      { timeout: 120_000, maxWait: 10_000 }
    );
  } catch (err) {
    if (err !== DRY_RUN) throw err;
  }
  return report;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const apply = args.has("--apply");
    const age = Number([...args].find((a) => a.startsWith("--age="))?.slice(6)) || undefined;
    const r = await refreshDemo(prisma, { apply, tidy: !args.has("--no-tidy"), shift: !args.has("--no-shift"), ageDays: age });
    const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none");
    console.log(`${apply ? "Done" : "Dry run (nothing changed; add --apply)"}:`);
    console.log(`- removed cases: ${list(r.removed.cases)}`);
    console.log(`- removed calls: ${r.removed.calls.length ? `${r.removed.calls.length} (${r.removed.calls[0]} … ${r.removed.calls.at(-1)})` : "none"}`);
    console.log(`- removed patients: ${list(r.removed.patients)}`);
    console.log(`- history moved ${r.shiftDays} day(s) (${r.shiftedRows} values)`);
    console.log(`- fixes: ${list(r.fixes)}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (typeof require !== "undefined" && require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
