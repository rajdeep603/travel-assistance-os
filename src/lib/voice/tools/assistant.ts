import { z } from "zod";
import { prisma } from "@/lib/db";
import { caseMoney } from "@/lib/services/exposure";
import { findCity } from "@/lib/services/nlu";
import { globalSearch, type SearchHit } from "@/lib/services/search";
import { MODE_LABELS } from "@/lib/services/transport";
import { utcToZoned } from "@/lib/time";
import { spokenDate } from "./booking";
import { defineTool } from "./types";

// ---------------------------------------------------------------------------
// Tools for the internal assistant's voice mode: read-only lookups for the
// operations team, and opening a record on the operator's screen. Nothing
// here files the session on a case or changes a record.
// ---------------------------------------------------------------------------

const human = (s: string) => s.replace(/_/g, " ").toLowerCase();
const eur = (n: number) => `${Math.round(n).toLocaleString("en-GB")} EUR`;

/** "case 1022", "CASE1022" → "CASE-1022"; other references keep their own shape. */
export function normalizeRef(spoken: string): string {
  const t = spoken.trim().toUpperCase().replace(/\s+/g, " ");
  const m = t.match(/^([A-Z]{2,5})[\s-]?(\d{3,6})$/);
  return m ? `${m[1]}-${m[2]}` : t;
}

export const lookupCaseTool = defineTool({
  name: "lookup_case",
  description:
    "Everything about one case for a colleague: patient, status, priority, who is assigned, next appointment, guarantees of payment, the latest claim, transport home, money (guaranteed, invoiced, savings) and the latest timeline entries. Read-only.",
  schema: z.object({ case_ref: z.string().describe("e.g. CASE-1022") }),
  async execute(args) {
    const ref = normalizeRef(args.case_ref).replace(/^CASE(\d)/, "CASE-$1");
    const kase = await prisma.case.findUnique({
      where: { ref },
      include: {
        patient: true,
        appointments: {
          where: { status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { gte: new Date() } },
          orderBy: { scheduledAt: "asc" },
          take: 1,
          include: { provider: true },
        },
        guaranteeLetters: { orderBy: { createdAt: "desc" }, take: 3 },
        claims: { orderBy: { createdAt: "desc" }, take: 1 },
        transportPlans: { orderBy: { createdAt: "desc" }, take: 1 },
        events: { orderBy: { createdAt: "desc" }, take: 3, select: { title: true, createdAt: true } },
      },
    });
    if (!kase) return { found: false, message: `No case ${ref}. Ask for the reference again, or use search_records with the patient's name.` };
    const next = kase.appointments[0];
    const slot = next ? utcToZoned(next.scheduledAt) : null;
    const claim = kase.claims[0];
    const plan = kase.transportPlans[0];
    const money = await caseMoney(kase.id).catch(() => null);
    const issues = (Array.isArray(claim?.issues) ? claim.issues : []) as { severity?: string; message?: string }[];
    return {
      found: true,
      case_ref: kase.ref,
      title: kase.title,
      patient: `${kase.patient.firstName} ${kase.patient.lastName}, ${kase.patient.nationality}, policy ${kase.patient.policyNumber}`,
      location: kase.location,
      status: human(kase.status),
      priority: human(kase.priority),
      assistance_type: human(kase.assistanceType),
      assigned_to: kase.assignedTo ?? "nobody yet",
      ai_summary: kase.aiSummary,
      next_appointment:
        next && slot ? { ref: next.ref, when: `${spokenDate(slot.date)} at ${slot.time}`, doctor: next.provider.name, facility: next.provider.facility } : null,
      guarantees: kase.guaranteeLetters.map((l) => ({
        ref: l.ref,
        hospital: l.hospitalName,
        status: human(l.status),
        amount: `${Number(l.guaranteedAmount).toLocaleString("en-GB")} ${l.currency}`,
        valid_until: l.validUntil.toISOString().slice(0, 10),
      })),
      claim: claim
        ? { ref: claim.ref, status: human(claim.status), still_needed: issues.filter((i) => i.severity === "error").map((i) => i.message) }
        : null,
      transport_home: plan ? { ref: plan.ref, mode: MODE_LABELS[plan.mode], status: human(plan.status) } : null,
      money: money
        ? {
            guaranteed: eur(money.guaranteed),
            invoiced: eur(money.invoiced),
            savings_identified: eur(money.savingsIdentified),
            savings_accepted: eur(money.savingsAccepted),
            policy_remaining: money.policy ? `${Math.round(money.policy.remaining).toLocaleString("en-GB")} ${money.policy.currency}` : null,
          }
        : null,
      latest_timeline: kase.events.map((e) => `${e.createdAt.toISOString().slice(0, 10)}: ${e.title}`),
    };
  },
});

export const searchRecordsTool = defineTool({
  name: "search_records",
  description:
    "Search every record by name or reference: cases, travellers, claims, calls, inbox messages, guarantees of payment, transport plans, documents and appointments. Use it for a patient's name, a hospital, or any reference that isn't a case.",
  schema: z.object({ query: z.string().describe("A name (\"Lena Koch\") or a reference (\"LOG-0902\")") }),
  async execute(args) {
    const q = /\d/.test(args.query) ? normalizeRef(args.query) : args.query;
    const hits = (await globalSearch(q, 3)).slice(0, 8);
    if (!hits.length) return { results: [], message: `Nothing matches "${args.query}". Ask for the spelling or a reference.` };
    return { results: hits.map((h) => ({ kind: h.kind, ref: h.ref, title: h.title, detail: h.subtitle })) };
  },
});

export const findProvidersTool = defineTool({
  name: "find_providers",
  description: "List network providers (doctors, clinics, hospitals) in a city, optionally by specialty, with their languages.",
  schema: z.object({
    city: z.string().describe("e.g. Istanbul"),
    specialty: z.string().describe("e.g. cardiology, dentist; empty for all").default(""),
  }),
  async execute(args) {
    const city = findCity(args.city) ?? args.city.trim();
    const specialty = args.specialty.trim().replace(/(ist|ists|y)$/i, "");
    const providers = await prisma.provider.findMany({
      where: {
        city: { equals: city, mode: "insensitive" },
        ...(specialty.length > 2 ? { specialty: { contains: specialty, mode: "insensitive" as const } } : {}),
      },
      orderBy: { rating: "desc" },
      take: 6,
    });
    if (!providers.length) return { providers: [], message: `No ${args.specialty || ""} providers in ${city} in the demo network.`.replace(/\s+/g, " ") };
    return {
      providers: providers.map((p) => ({ doctor: p.name, specialty: p.specialty, facility: p.facility, district: p.district, languages: p.languages })),
    };
  },
});

/** Modules the assistant can open by name. */
const PAGES: { href: string; label: string; names: string[] }[] = [
  { href: "/", label: "the dashboard", names: ["dashboard", "overview", "home"] },
  { href: "/cases", label: "the case list", names: ["cases", "case manager", "case list"] },
  { href: "/claims", label: "claims", names: ["claims", "claim list"] },
  { href: "/inbox", label: "the inbox", names: ["inbox", "e-mail", "email", "fax"] },
  { href: "/documents", label: "Medical Document AI", names: ["documents", "document ai"] },
  { href: "/providers", label: "provider search", names: ["providers", "provider search", "provider network"] },
  { href: "/calls", label: "the Call Center", names: ["call center", "calls", "call log"] },
  { href: "/business-case", label: "the business case", names: ["business case", "roi"] },
];

/** The record or module a spoken target refers to (exported for tests). */
export function pageFor(target: string): { href: string; label: string } | null {
  const t = target.trim().toLowerCase();
  const page = PAGES.find((p) => p.names.some((n) => t === n || t === `the ${n}`));
  return page ? { href: page.href, label: page.label } : null;
}

export const openRecordTool = defineTool({
  name: "open_record",
  description:
    "Open a record or a module on the operator's screen: a reference (CASE-1022, CLM-10240, LOG-0902, CALL-1027, MT-1001, a message or appointment reference) or a module name (dashboard, cases, claims, inbox, documents, providers, call center, business case).",
  schema: z.object({ target: z.string() }),
  async execute(args, ctx) {
    const page = pageFor(args.target);
    let open: { href: string; label: string; hit?: SearchHit } | null = page;
    if (!open) {
      const ref = normalizeRef(args.target);
      const hits = await globalSearch(ref, 3);
      const hit = hits.find((h) => h.ref.toUpperCase() === ref) ?? (hits.length === 1 ? hits[0] : null);
      if (hit) open = { href: hit.href, label: hit.ref, hit };
    }
    if (!open) return { opened: false, message: `Couldn't find "${args.target}" to open. Ask which record they mean.` };
    ctx.emit({ type: "navigate", href: open.href, label: open.label });
    return { opened: true, showing: open.hit ? `${open.hit.ref}: ${open.hit.title}` : open.label };
  },
});
