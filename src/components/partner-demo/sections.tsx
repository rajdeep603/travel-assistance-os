"use client";

import { ArrowRight, BookOpen, CalendarClock, CheckCircle2, Clock, Handshake, Headset, Lock, Mail, Network, ShieldCheck, Wrench, XCircle } from "lucide-react";
import { BENEFIT_LABELS_TR, LANGUAGE_TR, SPECIALTY_TR, type PortalCopy } from "@/lib/partner-demo/copy";
import type { PortalKit, PortalLang } from "@/lib/partner-demo/kit";

export interface Knowledge {
  plans: { name: string; medicalLimit: number; currency: string; holders: string[]; benefits: { code: string; label: string; covered: boolean; limit: number | null; excess: number; waitingHours: number | null }[] }[];
  network: { ref: string; facility: string; district: string; city: string; specialty: string; doctor: string; languages: string[]; kind: string }[];
}

export function SectionHeading({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold tracking-tight text-ink md:text-[28px]">{title}</h2>
      {intro ? <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">{intro}</p> : null}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6 ${className}`}>{children}</div>;
}

function Tile({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>{children}</span>;
}

// --- Welcome -----------------------------------------------------------------

export function WelcomeSection({
  copy,
  lang,
  kit,
  contactName,
  hostContact,
  minuteBudget,
  sessionMinutes,
  expiry,
  onStart,
}: {
  copy: PortalCopy;
  lang: PortalLang;
  kit: PortalKit;
  contactName: string;
  hostContact: string | null;
  minuteBudget: number;
  sessionMinutes: number;
  expiry: string;
  onStart: () => void;
}) {
  const w = copy.welcome;
  return (
    <div className="space-y-5">
      <div className="hero-sky relative overflow-hidden rounded-3xl border border-line px-6 py-8 text-ink md:px-10 md:py-10">
        <div aria-hidden className="hero-map absolute inset-0 opacity-60" />
        <div className="relative max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight md:text-[32px] md:leading-tight">{w.title(kit.company)}</h2>
          <p className="mt-4 text-base font-semibold text-ink">{w.hello(contactName)}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink/85 md:text-base">{kit.intro[lang]}</p>
          <button
            type="button"
            onClick={onStart}
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-brand bg-brand-gradient px-6 text-base font-semibold text-white shadow-glow transition-transform duration-150 active:scale-[0.98]"
          >
            {w.start} <ArrowRight size={18} className="rtl:rotate-180" aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="text-base font-semibold text-ink">{w.insideTitle}</h3>
          <ul className="mt-3 space-y-2.5">
            {w.inside.map((item) => (
              <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed text-ink">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="text-base font-semibold text-ink">{w.howTitle}</h3>
          <ol className="mt-3 space-y-2.5">
            {w.how.map((item, i) => (
              <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-ink">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">{i + 1}</span>
                {item}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm leading-relaxed text-muted">{w.tips}</p>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Card className="md:col-span-2">
          <div className="flex gap-3">
            <Tile tone="bg-amber-50 text-amber-600">
              <Clock size={18} aria-hidden />
            </Tile>
            <div>
              <p className="text-[15px] leading-relaxed text-ink">{w.limits(minuteBudget, sessionMinutes, expiry)}</p>
              <p className="mt-2 text-sm text-muted">{w.fictional}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex gap-3">
            <Tile tone="bg-blue-50 text-blue-600">
              <CalendarClock size={18} aria-hidden />
            </Tile>
            <div>
              <p className="text-xs font-medium text-muted">{w.nextCall}</p>
              <p className="mt-0.5 text-[15px] font-semibold text-ink">{kit.nextMeeting[lang]}</p>
              {hostContact ? (
                <>
                  <p className="mt-3 text-xs font-medium text-muted">{w.contact}</p>
                  <p className="mt-0.5 break-words text-sm text-ink">{hostContact}</p>
                </>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// --- How it learns -------------------------------------------------------------

export function LearnsSection({ copy, lang, knowledge }: { copy: PortalCopy; lang: PortalLang; knowledge: Knowledge | null }) {
  const l = copy.learns;
  const tr = lang === "tr";
  const eur = (n: number) => new Intl.NumberFormat(copy.locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const icons = [BookOpen, Wrench, ShieldCheck];
  const tones = ["bg-blue-50 text-blue-600", "bg-violet-50 text-violet-600", "bg-emerald-50 text-emerald-600"];
  return (
    <div className="space-y-5">
      <SectionHeading title={l.title} intro={l.intro} />
      <div className="grid gap-5 md:grid-cols-3">
        {l.layers.map((layer, i) => {
          const Icon = icons[i];
          return (
            <Card key={layer.title}>
              <Tile tone={tones[i]}>
                <Icon size={18} aria-hidden />
              </Tile>
              <h3 className="mt-3 text-base font-semibold text-ink">{layer.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{layer.text}</p>
            </Card>
          );
        })}
      </div>

      {knowledge ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {knowledge.plans.map((plan) => (
            <Card key={plan.name}>
              <h3 className="text-base font-semibold text-ink">
                {l.plansTitle}: {plan.name} · {eur(plan.medicalLimit)}
              </h3>
              <p className="mt-1 text-sm text-muted">{l.plansNote(plan.holders.join(", "))}</p>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-start text-xs font-medium text-muted">
                    <th className="pb-1.5 text-start font-medium" />
                    <th className="pb-1.5 text-start font-medium" />
                    <th className="pb-1.5 text-end font-medium">{l.limit}</th>
                    <th className="pb-1.5 text-end font-medium">{l.excess}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.benefits.map((b) => (
                    <tr key={b.code} className="border-t border-line">
                      <td className="py-1.5 pe-2 text-ink">{tr ? (BENEFIT_LABELS_TR[b.code] ?? b.label) : b.label}</td>
                      <td className="py-1.5 pe-2">
                        {b.covered ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 size={14} aria-hidden /> {l.covered}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted">
                            <XCircle size={14} aria-hidden /> {l.notCovered}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-end tabular-nums text-ink">{b.covered ? (b.limit == null ? l.unlimited : eur(b.limit)) : "—"}</td>
                      <td className="py-1.5 text-end tabular-nums text-ink">{b.covered ? eur(b.excess) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      ) : null}

      {knowledge ? (
        <Card>
          <h3 className="text-base font-semibold text-ink">{l.networkTitle}</h3>
          <p className="mt-1 text-sm text-muted">{l.networkNote}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {knowledge.network.map((p) => (
              <div key={p.ref} className="rounded-xl bg-canvas p-3.5 ring-1 ring-line">
                <p className="text-[15px] font-semibold text-ink">{p.facility}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {p.district}, {p.city} · {tr ? (SPECIALTY_TR[p.specialty] ?? p.specialty) : p.specialty}
                </p>
                <p className="mt-1 text-sm text-ink">{p.doctor}</p>
                <p className="mt-1 text-xs text-muted">{p.languages.map((x) => (tr ? (LANGUAGE_TR[x] ?? x) : x)).join(" · ")}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <h3 className="text-base font-semibold text-ink">{l.matrixTitle}</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="w-2/5 pb-2 text-start font-medium">{l.matrixSituation}</th>
                <th className="pb-2 text-start font-medium">{l.matrixAction}</th>
              </tr>
            </thead>
            <tbody>
              {l.matrix.map(([situation, action]) => (
                <tr key={situation} className="border-t border-line align-top">
                  <td className="py-2.5 pe-4 font-medium text-ink">{situation}</td>
                  <td className="py-2.5 text-ink">{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Lock size={17} className="text-red-600" aria-hidden /> {l.neverTitle}
          </h3>
          <ul className="mt-3 space-y-2">
            {l.never.map((x) => (
              <li key={x} className="flex gap-2 text-[15px] leading-relaxed text-ink">
                <XCircle size={16} className="mt-1 shrink-0 text-red-500" aria-hidden />
                {x}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Headset size={17} className="text-emerald-600" aria-hidden /> {l.handsOverTitle}
          </h3>
          <ul className="mt-3 space-y-2">
            {l.handsOver.map((x) => (
              <li key={x} className="flex gap-2 text-[15px] leading-relaxed text-ink">
                <ArrowRight size={16} className="mt-1 shrink-0 text-emerald-600 rtl:rotate-180" aria-hidden />
                {x}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h3 className="text-base font-semibold text-ink">{l.tuneTitle}</h3>
        <p className="mt-1 text-xs text-muted">{l.tuneNote}</p>
        <p className="mt-3 rounded-xl bg-violet-50 px-4 py-3 text-[15px] font-medium leading-relaxed text-violet-900 ring-1 ring-violet-100">{l.rule}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {[
            { title: l.before, line: l.beforeLine, tone: "ring-red-200 bg-red-50/50" },
            { title: l.after, line: l.afterLine, tone: "ring-emerald-200 bg-emerald-50/50" },
          ].map((side) => (
            <div key={side.title} className={`rounded-xl p-4 ring-1 ${side.tone}`}>
              <p className="text-xs font-semibold text-ink">{side.title}</p>
              <p className="mt-2 text-[15px] leading-relaxed">
                <span className="me-2 text-xs font-semibold text-teal-700">{l.caller}</span>
                {l.callerLine}
              </p>
              <p className="mt-2 text-[15px] leading-relaxed">
                <span className="me-2 text-xs font-semibold text-brand">{l.agent}</span>
                {side.line}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">{l.tuneHow}</p>
      </Card>
    </div>
  );
}

// --- Integration & architecture ---------------------------------------------------

function Diagram({ copy }: { copy: PortalCopy }) {
  const d = copy.integration.diagram;
  const box = "rounded-xl px-3 py-2.5 text-center ring-1";
  return (
    <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1.3fr_auto_1fr]">
      <div className="space-y-3">
        <div className={`${box} bg-emerald-50 ring-emerald-200`}>
          <p className="text-sm font-semibold text-ink">{d.callers}</p>
          <p className="text-xs text-muted">{d.callersSub}</p>
        </div>
        <div className={`${box} bg-blue-50 ring-blue-200`}>
          <p className="text-sm font-semibold text-ink">{d.inbound}</p>
        </div>
      </div>
      <ArrowRight className="mx-auto rotate-90 text-muted md:rotate-0" size={20} aria-hidden />
      <div className="space-y-3 rounded-2xl bg-stage p-3.5 text-stage-ink">
        <div className="rounded-xl bg-stage-raised px-3 py-2.5 text-center">
          <p className="text-sm font-semibold">{d.agents}</p>
          <p className="text-xs text-stage-muted">{d.agentsSub}</p>
        </div>
        <div className="rounded-xl bg-stage-raised px-3 py-2.5 text-center">
          <p className="text-sm font-semibold">{d.docs}</p>
        </div>
        <div className="rounded-xl bg-white/10 px-3 py-2.5 text-center ring-1 ring-white/15">
          <p className="text-sm font-semibold">{d.tools}</p>
          <p className="text-xs text-stage-muted">{d.toolsSub}</p>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <ArrowRight className="rotate-90 text-muted md:rotate-0" size={20} aria-hidden />
        <p className="text-[11px] text-muted">{d.readWrite}</p>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className={`${box} bg-violet-50 ring-violet-200`}>
            <p className="text-sm font-semibold text-ink">{d.mcp}</p>
          </div>
          <div className={`${box} bg-violet-50 ring-violet-200`}>
            <p className="text-sm font-semibold text-ink">{d.api}</p>
          </div>
        </div>
        <div className={`${box} bg-amber-50 ring-amber-200`}>
          <p className="text-sm font-semibold text-ink">{d.crm}</p>
          <p className="text-xs text-muted">{d.crmSub}</p>
        </div>
        <p className="text-center font-mono text-[11px] text-muted">{d.after}</p>
      </div>
    </div>
  );
}

export function IntegrationSection({ copy }: { copy: PortalCopy }) {
  const g = copy.integration;
  return (
    <div className="space-y-5">
      <SectionHeading title={g.title} intro={g.intro} />
      <Card>
        <Diagram copy={copy} />
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Network size={17} className="text-violet-600" aria-hidden /> {g.mcpTitle}
          </h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{g.mcpText}</p>
          <ul className="mt-3 space-y-1.5">
            {g.tools.map(([name, what]) => (
              <li key={name} className="flex flex-wrap gap-x-3 text-sm">
                <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[13px] text-ink ring-1 ring-line">{name}</code>
                <span className="text-ink">{what}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm font-medium text-violet-700">{g.mcpStatus}</p>
        </Card>
        <Card>
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Mail size={17} className="text-blue-600" aria-hidden /> {g.restTitle}
          </h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{g.restText}</p>
          <ul className="mt-3 space-y-1.5">
            {g.endpoints.map(([path, what]) => (
              <li key={path} className="text-sm">
                <code className="font-mono text-[13px] text-ink">{path}</code>
                <span className="block text-muted">{what}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-medium text-muted">{g.webhooksTitle}</p>
          <p className="mt-0.5 font-mono text-[13px] text-ink">{g.webhooks}</p>
          <p className="mt-1 text-xs text-muted">{g.signed}</p>
        </Card>
      </div>
      <Card>
        <h3 className="text-base font-semibold text-ink">{g.connectorTitle}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{g.connectorText}</p>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="text-base font-semibold text-ink">{g.archTitle}</h3>
          <dl className="mt-3 space-y-3">
            {g.arch.map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm font-semibold text-ink">{k}</dt>
                <dd className="mt-0.5 text-[15px] leading-relaxed text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <ShieldCheck size={17} className="text-emerald-600" aria-hidden /> {g.securityTitle}
          </h3>
          <dl className="mt-3 space-y-3">
            {g.security.map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm font-semibold text-ink">{k}</dt>
                <dd className="mt-0.5 text-[15px] leading-relaxed text-muted">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted">{g.demoEnv}</p>
        </Card>
      </div>
    </div>
  );
}

// --- Pilot & partnership -------------------------------------------------------------

export function PilotSection({ copy, lang, kit }: { copy: PortalCopy; lang: PortalLang; kit: PortalKit }) {
  const p = copy.pilot;
  return (
    <div className="space-y-5">
      <SectionHeading title={p.title} intro={p.intro} />
      <Card>
        <ol className="grid gap-4 md:grid-cols-5">
          {p.steps.map(([name, length, what], i) => (
            <li key={name} className="relative">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">{i + 1}</span>
                <span className="text-[15px] font-semibold text-ink">{name}</span>
              </div>
              {length ? <p className="mt-1 ps-9 text-xs font-medium text-brand">{length}</p> : null}
              <p className="mt-1.5 ps-9 text-sm leading-relaxed text-muted md:ps-0">{what}</p>
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="text-base font-semibold text-ink">{p.needsTitle(kit.company)}</h3>
          <ul className="mt-3 space-y-2">
            {p.needs.map((n) => (
              <li key={n} className="flex gap-2 text-[15px] leading-relaxed text-ink">
                <CheckCircle2 size={16} className="mt-1 shrink-0 text-brand" aria-hidden />
                {n}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Handshake size={17} className="text-amber-600" aria-hidden /> {p.partnerTitle}
          </h3>
          <p className="mt-2 text-[15px] leading-relaxed text-ink">{p.partner(kit.company)}</p>
          <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 ring-1 ring-blue-100">
            <p className="text-xs font-medium text-blue-700">{p.nextTitle}</p>
            <p className="mt-0.5 text-[15px] text-ink">{p.next(kit.nextMeeting[lang])}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
