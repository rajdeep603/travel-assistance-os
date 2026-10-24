import type { CSSProperties, ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import {
  CURRENCY,
  costBasis,
  formatCount,
  longDate,
  combinedSavingLine,
  paybackLine,
  readingLines,
  quoteBasis,
  quoteTerms,
  returnFacts,
  returnTiles,
  servicesCaption,
  type BusinessCaseReport,
  type QuoteMeta,
} from "@/lib/business-case";
import { formatMoney } from "@/lib/format";
import { PILOT_BILLING_NOTE, PILOT_DAYS, PILOT_PHASES } from "@/lib/pilots";

// ---------------------------------------------------------------------------
// The quotation as a page on screen: the same sections, figures and wording
// as the PDF (src/lib/services/business-case-pdf.ts), laid out to print on A4
// with the second half on its own page.
// ---------------------------------------------------------------------------

/** Sthiram's green, from the logo: the quotation is Sthiram's document, not the app's. */
const ACCENT: CSSProperties = { color: "#048a5c" };
const ACCENT_RULE: CSSProperties = { backgroundColor: "#048a5c" };

const eur = (n: number) => formatMoney(Math.round(n), CURRENCY);
/** The return tiles fill their row whatever the quotation's scope leaves: four, three or two. */
const TILE_GRID: Record<number, string> = {
  2: "grid-cols-2 print:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3 print:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4 print:grid-cols-4",
};
const pct = (n: number) => `${formatCount(Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0)))}%`;

function Section({ title, sub, children, className = "" }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mt-7 print:mt-5 ${className}`}>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** A plain document table: muted header, ruled rows, bold total, figures right-aligned. */
function Table({ head, rows, total, align }: { head?: string[]; rows: string[][]; total?: string[]; align: ("l" | "r")[] }) {
  const cell = (i: number) => (align[i] === "r" ? "text-right tabular-nums" : "text-left");
  return (
    <table className="w-full text-[13px]">
      {head ? (
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className={`py-1.5 pr-3 font-normal last:pr-0 print:py-1 ${cell(i)}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} className="break-inside-avoid border-b border-line">
            {row.map((value, i) => (
              <td key={i} className={`py-1.5 pr-3 align-top text-ink last:pr-0 print:py-1 ${cell(i)}`}>
                {value}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {total ? (
        <tfoot>
          <tr className="font-semibold text-ink">
            {total.map((value, i) => (
              <td key={i} className={`pr-3 pt-2 last:pr-0 ${cell(i)}`}>
                {value}
              </td>
            ))}
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

export function QuotationPreview({ report, meta }: { report: BusinessCaseReport; meta: QuoteMeta }) {
  const { input, result, running, cost, quote } = report;
  const contact = [quote.companyName ? quote.customerName : "", quote.email, quote.phone].filter(Boolean).join(" · ");
  const facts = returnFacts(running);
  const tiles = returnTiles(report);

  return (
    // A document for the customer, in English like the PDF: not translated with the interface.
    <article
      translate="no"
      aria-label={`Quotation ${meta.number}`}
      className="mx-auto w-full max-w-[820px] rounded-xl bg-white px-6 py-7 text-ink shadow-sm ring-1 ring-line sm:px-10 sm:py-9 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- also printed from a copied frame, where next/image can't run */}
        <img src="/brand/sthiram-logo.png" alt={BRAND.company} width={256} height={62} className="h-8 w-auto sm:h-9" />
        <div className="text-right">
          <h2 className="text-2xl font-semibold tracking-tight">Quotation</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            No. <span className="tabular-nums">{meta.number}</span>
            <br />
            Date {longDate(meta.date)}
            <br />
            Valid until {longDate(meta.validUntil)}
          </p>
        </div>
      </header>
      <div className="mt-4 h-0.5" style={ACCENT_RULE} aria-hidden />

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted">Prepared for</p>
          <p className="font-semibold">{quote.companyName || quote.customerName || "Your organisation"}</p>
          {contact ? <p className="text-xs text-muted [overflow-wrap:anywhere]">{contact}</p> : null}
        </div>
        <div>
          <p className="text-xs text-muted">From</p>
          <p className="font-semibold">{BRAND.company}</p>
          <p className="text-xs text-muted">
            {BRAND.name} · {BRAND.tagline}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 rounded-lg bg-canvas px-5 py-4 sm:grid-cols-3 print:grid-cols-3">
        {[
          { label: "Services a month", value: eur(quote.monthlyRunningCost), note: "estimate, billed on use" },
          {
            label: "Service charges, one-time",
            value: eur(quote.oneTimeTotal),
            note: quote.services.length ? `${quote.services.length} ${quote.services.length === 1 ? "item" : "items"}` : "none quoted",
          },
          { label: "First year in total", value: eur(quote.firstYearCost), note: "one-time plus 12 months" },
        ].map((f) => (
          <div key={f.label}>
            <p className="text-xs text-muted">{f.label}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">{f.value}</p>
            <p className="text-[11px] text-muted">{f.note}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm font-semibold" style={ACCENT}>
        {paybackLine(report)}
      </p>

      <Section title="Services, a month" sub={servicesCaption(running)}>
        {running.lines.length ? (
          <Table
            head={["Service", "Basis", "A month"]}
            align={["l", "l", "r"]}
            rows={running.lines.map((l) => [l.label, costBasis(l), eur(l.cost)])}
            total={["Total a month", `${eur(running.annualCost)} a year`, eur(running.monthlyCost)]}
          />
        ) : null}
      </Section>

      <Section title="Service charges" sub="One-time, fixed for the validity of this quotation">
        {quote.services.length ? (
          <Table
            head={["", "Service", "Amount"]}
            align={["l", "l", "r"]}
            rows={quote.services.map((s, i) => [`${i + 1}`, s.description, s.amount > 0 ? eur(s.amount) : "Included"])}
            total={["", "Total one-time", eur(quote.oneTimeTotal)]}
          />
        ) : (
          <p className="text-sm text-muted">No one-time service charges in this quotation.</p>
        )}
      </Section>

      {quote.pilot ? (
        <Section title={`${PILOT_DAYS}-day pilot: ${quote.pilot.label}`} sub="One flow first, judged on agreed measures, before any wider roll-out">
          <p className="text-[13px] text-ink">{quote.pilot.scope}</p>
          <p className="mt-1 text-[13px] text-muted">{PILOT_BILLING_NOTE}</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
            <div>
              <p className="text-xs font-semibold">Judged on</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
                {quote.pilot.measures.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold">Plan</p>
              <dl className="mt-1 space-y-1 text-[13px]">
                {PILOT_PHASES.map((p) => (
                  <div key={p.days} className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
                    <dt className="tabular-nums text-muted">{p.days}</dt>
                    <dd>{p.what}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Section>
      ) : null}

      <Section title="Terms">
        <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink">
          {quoteTerms(meta).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Section>

      <Section title="What it returns" sub={`With your numbers, at a loaded cost of ${eur(input.operation.costPerHour)} an agent hour`} className="print:break-before-page">
        <p className="text-sm font-semibold leading-snug">{report.headline}</p>
        <div className={`mt-3 grid gap-2 ${TILE_GRID[tiles.length] ?? TILE_GRID[4]}`}>
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg bg-canvas px-3 py-2.5 print:py-2">
              <p className="text-base font-semibold tabular-nums">{t.value}</p>
              <p className="text-[11px] font-semibold leading-tight">{t.label}</p>
              <p className="text-[11px] leading-tight text-muted">{t.note}</p>
            </div>
          ))}
        </div>
        {facts.length ? <p className="mt-2 text-[13px]">{facts.join(" ")}</p> : null}

        <div className="mt-4">
          <Table
            head={["Where the time comes from", "Volume", "Hours today", "Hours freed", "Saving"]}
            align={["l", "r", "r", "r", "r"]}
            rows={result.areas.map((a) => [a.label, formatCount(a.volume), `${formatCount(a.hoursToday)} h`, `${formatCount(a.hoursFreed)} h`, eur(a.saving)])}
            total={["Total a month", "", `${formatCount(result.hoursToday)} h`, `${formatCount(result.hoursFreed)} h`, eur(result.monthlySaving)]}
          />
        </div>
        <div className="mt-4">
          <Table
            head={["Medical spend: what bill review saves", ""]}
            align={["l", "r"]}
            rows={[
              ["Medical spend abroad a year", eur(input.costContainment.annualMedicalSpend)],
              ["Bills reviewed line by line against your tariff", `${pct(input.costContainment.reviewedPct)} (${eur(cost.reviewedSpend)})`],
              ["Average saving on a reviewed bill", pct(input.costContainment.savingPct)],
            ]}
            total={["Medical spend saved a year", eur(cost.annualSaving)]}
          />
        </div>
        {result.annualSaving > 0 ? (
          <p className="mt-3 text-sm font-semibold" style={ACCENT}>
            {combinedSavingLine(report)}
          </p>
        ) : null}
        {readingLines(report).length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] leading-snug">
            {readingLines(report).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="What this is based on">
        <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-3 print:gap-x-4">
          {quoteBasis(report).map(([label, value]) => (
            <div key={label} className="break-inside-avoid border-b border-line py-1.5 print:py-1">
              <dt className="text-[11px] text-muted">{label}</dt>
              <dd className="text-[13px] text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* On paper the letterhead already carries the number; this line would only start a third page. */}
      <footer className="mt-7 border-t border-line pt-2 text-[11px] text-muted print:hidden">
        {BRAND.company} · {BRAND.name} quotation {meta.number}
      </footer>
    </article>
  );
}
