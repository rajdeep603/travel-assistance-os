"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { FileCheck2, Globe2, Headset, Hospital, Languages, Lock, ShieldAlert, Timer } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { CallResult, fmtDuration, fmtWhen } from "@/components/partner-demo/call-result";
import { GuaranteeScenario } from "@/components/partner-demo/guarantee-scenario";
import { IntegrationSection, LearnsSection, PilotSection, SectionHeading, WelcomeSection, type Knowledge } from "@/components/partner-demo/sections";
import { VoiceScenario } from "@/components/partner-demo/voice-scenario";
import { POWERED_BY } from "@/lib/brand";
import { PORTAL_COPY, type PortalCopy } from "@/lib/partner-demo/copy";
import { kitOf, type PortalKit, type PortalLang, type ScenarioId } from "@/lib/partner-demo/kit";

type SectionId = "welcome" | "try" | "results" | "learns" | "integration" | "pilot";
const SECTIONS: SectionId[] = ["welcome", "try", "results", "learns", "integration", "pilot"];

interface Usage {
  budgetSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  sessionSeconds: number;
  active: number;
  maxConcurrent: number;
}

interface PortalInfo {
  state: "open" | "expired" | "revoked";
  portal: { kit: string; company: string; contactName: string; emailDomain: string | null; hostContact: string | null; expiresAt: string; minuteBudget: number; sessionSeconds: number };
  viewer: { name: string; company: string } | null;
  usage?: Usage;
  voiceAvailable?: boolean;
  knowledge?: Knowledge;
}

const LANG_KEY = "caretrail-partner-demo-lang";

function initialLang(): PortalLang {
  if (typeof window === "undefined") return "tr";
  const q = new URLSearchParams(window.location.search).get("lang");
  if (q === "en" || q === "tr") return q;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "tr") return saved;
  } catch {
    // private mode
  }
  return "tr";
}

const SCENARIO_ICONS: Record<ScenarioId, typeof Headset> = { hotline: Headset, hospital: Hospital, interpreter: Languages, guarantee: FileCheck2 };
const SCENARIO_TONES: Record<ScenarioId, string> = {
  hotline: "bg-emerald-50 text-emerald-600",
  hospital: "bg-blue-50 text-blue-600",
  interpreter: "bg-amber-50 text-amber-600",
  guarantee: "bg-violet-50 text-violet-600",
};

/** A faint repeated line across the page, as on a confidential paper copy. */
function Watermark({ text }: { text: string }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260"><text x="0" y="150" transform="rotate(-24 210 130)" font-family="Geist, Arial, sans-serif" font-size="17" font-weight="600" fill="rgb(15,23,42)">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></svg>`;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 opacity-[0.035] print:opacity-[0.08]"
      style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`, backgroundRepeat: "repeat" }}
    />
  );
}

function Shell({ copy, lang, setLang, info, header, children }: { copy: PortalCopy; lang: PortalLang; setLang: (l: PortalLang) => void; info: PortalInfo | null; header?: React.ReactNode; children: React.ReactNode }) {
  const company = info?.portal.company ?? "";
  const expiry = info ? new Intl.DateTimeFormat(copy.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date(info.portal.expiresAt)) : "";
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-canvas text-ink" lang={lang}>
      {company ? <Watermark text={copy.footer.watermark(company)} /> : null}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {company ? <span className="truncate text-[15px] font-bold text-ink md:text-base">{company}</span> : null}
            {company ? <span className="text-muted" aria-hidden>×</span> : null}
            <BrandLogo height={22} />
            <span className="ms-1 hidden items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-100 sm:inline-flex">
              <Lock size={12} aria-hidden /> {copy.brandLine}
            </span>
          </div>
          {header}
          <button
            type="button"
            onClick={() => setLang(lang === "tr" ? "en" : "tr")}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink hover:border-brand/40"
          >
            <Globe2 size={15} aria-hidden /> {copy.langToggle}
          </button>
        </div>
      </header>
      <main id="main-content" className="relative mx-auto max-w-6xl px-4 pb-12 pt-5 md:px-6 md:pt-8">
        {children}
      </main>
      {info ? (
        <footer className="relative mx-auto max-w-6xl px-4 pb-8 text-center text-xs leading-relaxed text-muted md:px-6">
          <p>{copy.footer.confidential(company, expiry)}</p>
          <p>
            {copy.footer.fictional} · {POWERED_BY}
          </p>
        </footer>
      ) : null}
    </div>
  );
}

const FIELD = "mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base text-ink placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

function AckGate({ token, info, copy, onDone }: { token: string; info: PortalInfo; copy: PortalCopy; onDone: () => void }) {
  const a = copy.ack;
  const ids = { name: useId(), company: useId(), email: useId(), agree: useId() };
  const [name, setName] = useState(info.portal.contactName);
  const [company, setCompany] = useState(info.portal.company);
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !company.trim() || !email.trim()) return setError(a.needFields);
    if (!agree) return setError(a.needAgree);
    setBusy(true);
    try {
      const res = await fetch(`/api/public/partner-demo/${encodeURIComponent(token)}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, email, agree: true }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.code === "EMAIL_NOT_ALLOWED" ? a.badEmail(info.portal.emailDomain) : body?.error?.code === "INCOMPLETE" ? a.needFields : (body?.error?.message ?? a.needFields));
        return;
      }
      onDone();
    } catch {
      setError(copy.states.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <form onSubmit={submit} className="rounded-3xl border border-line bg-surface p-6 shadow-card md:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <ShieldAlert size={20} aria-hidden />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{a.title}</h1>
        </div>
        <p className="mt-5 text-[15px] font-semibold text-ink">{a.hello(info.portal.contactName)}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink">{a.body(info.portal.company)}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{a.nda}</p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor={ids.name} className="block text-sm font-medium text-ink">
              {a.name}
            </label>
            <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={FIELD} />
          </div>
          <div>
            <label htmlFor={ids.company} className="block text-sm font-medium text-ink">
              {a.company}
            </label>
            <input id={ids.company} value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" className={FIELD} />
          </div>
          <div>
            <label htmlFor={ids.email} className="block text-sm font-medium text-ink">
              {a.email}
            </label>
            <input
              id={ids.email}
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder={info.portal.emailDomain ? a.emailHint(info.portal.emailDomain) : undefined}
              className={FIELD}
            />
          </div>
          <label htmlFor={ids.agree} className="flex cursor-pointer gap-3 rounded-xl bg-canvas p-3.5 text-[15px] leading-relaxed text-ink">
            <input id={ids.agree} type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-brand" />
            {a.agree}
          </label>
        </div>
        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-brand bg-brand-gradient text-base font-semibold text-white shadow-glow disabled:opacity-60"
        >
          {a.submit}
        </button>
        <p className="mt-3 text-center text-xs text-muted">{a.recorded}</p>
      </form>
    </div>
  );
}

function ResultsSection({ token, copy, lang, refreshKey }: { token: string; copy: PortalCopy; lang: PortalLang; refreshKey: number }) {
  const r = copy.results;
  const [calls, setCalls] = useState<{ ref: string; scenario: string | null; agent: string; status: string; startedAt: string; durationSec: number | null }[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/public/partner-demo/${encodeURIComponent(token)}/calls`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body) return;
        setCalls(body.calls);
        setOpen((o) => o ?? body.calls[0]?.ref ?? null);
      })
      .catch(() => undefined);
  }, [token, refreshKey]);
  const kit = kitOf("benefit");
  return (
    <div className="space-y-5">
      <SectionHeading title={r.title} intro={r.intro} />
      {calls && calls.length === 0 ? <p className="rounded-2xl border border-line bg-surface px-5 py-4 text-[15px] text-muted shadow-card">{r.empty}</p> : null}
      {calls?.length ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr]">
          <ul className="space-y-2 lg:sticky lg:top-24 lg:self-start">
            {calls.map((c) => (
              <li key={c.ref}>
                <button
                  type="button"
                  onClick={() => setOpen(c.ref)}
                  aria-pressed={open === c.ref}
                  className={`w-full rounded-xl px-4 py-3 text-start ring-1 transition-colors duration-150 ${open === c.ref ? "bg-brand/10 ring-brand/30" : "bg-surface ring-line hover:ring-brand/30"}`}
                >
                  <p className="text-sm font-semibold text-ink">{kit?.scenarios.find((s) => s.id === c.scenario)?.title[lang] ?? c.agent}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="tabular-nums">{c.ref}</span> · {fmtWhen(c.startedAt, lang)} · <span className="tabular-nums">{fmtDuration(c.durationSec)}</span> · {copy.statuses[c.status] ?? c.status}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0">{open ? <CallResult key={open} token={token} callRef={open} copy={copy} lang={lang} compact /> : null}</div>
        </div>
      ) : null}
    </div>
  );
}

function TrySection({ token, kit, copy, lang, info, onSessionChange }: { token: string; kit: PortalKit; copy: PortalCopy; lang: PortalLang; info: PortalInfo; onSessionChange: () => void }) {
  const [scenarioId, setScenarioId] = useState<ScenarioId>(() => {
    if (typeof window === "undefined") return "hotline";
    const s = new URLSearchParams(window.location.search).get("scenario");
    return kit.scenarios.some((x) => x.id === s) ? (s as ScenarioId) : "hotline";
  });
  const scenario = kit.scenarios.find((s) => s.id === scenarioId) ?? kit.scenarios[0];
  useEffect(() => {
    void fetch(`/api/public/partner-demo/${encodeURIComponent(token)}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "SCENARIO", value: scenarioId }),
    }).catch(() => undefined);
    const params = new URLSearchParams(window.location.search);
    params.set("scenario", scenarioId);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}${window.location.hash}`);
  }, [scenarioId, token]);

  return (
    <div className="space-y-5">
      <SectionHeading title={copy.tryIt.title} intro={copy.tryIt.intro(kit.company)} />
      <div role="tablist" aria-label={copy.tryIt.title} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kit.scenarios.map((s) => {
          const Icon = SCENARIO_ICONS[s.id];
          const selected = s.id === scenario.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setScenarioId(s.id)}
              className={`flex gap-3 rounded-2xl p-4 text-start ring-1 transition-colors duration-150 ${selected ? "bg-brand/[0.07] ring-2 ring-brand/50" : "bg-surface ring-line hover:ring-brand/30"} shadow-card`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${SCENARIO_TONES[s.id]}`}>
                <Icon size={18} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-snug text-ink">{s.title[lang]}</span>
                <span className="mt-1 block text-xs leading-snug text-muted">{s.tagline[lang]}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="max-w-4xl text-[15px] leading-relaxed text-ink">{scenario.summary[lang]}</p>
      {scenario.kind === "voice" ? (
        <VoiceScenario
          key={scenario.id}
          token={token}
          scenario={scenario}
          copy={copy}
          lang={lang}
          voiceAvailable={info.voiceAvailable !== false}
          remainingSeconds={info.usage?.remainingSeconds ?? 0}
          onSessionChange={onSessionChange}
        />
      ) : (
        <GuaranteeScenario token={token} copy={copy} lang={lang} />
      )}
    </div>
  );
}

export function PortalApp({ token }: { token: string }) {
  const [lang, setLangState] = useState<PortalLang>("tr");
  const [info, setInfo] = useState<PortalInfo | null>(null);
  const [failure, setFailure] = useState<"invalid" | "network" | null>(null);
  const [section, setSection] = useState<SectionId>("welcome");
  const [refreshKey, setRefreshKey] = useState(0);
  const copy = PORTAL_COPY[lang];

  useEffect(() => {
    setLangState(initialLang());
    const hash = window.location.hash.replace("#", "") as SectionId;
    if (SECTIONS.includes(hash)) setSection(hash);
  }, []);

  const setLang = useCallback((l: PortalLang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // private mode
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/partner-demo/${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) return setFailure("invalid");
      setInfo(body);
    } catch {
      setFailure("network");
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);

  const kit = useMemo(() => (info ? kitOf(info.portal.kit) : null), [info]);
  const open = info?.state === "open" && info.viewer && kit;

  function go(next: SectionId) {
    setSection(next);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  useEffect(() => {
    if (!open) return;
    void fetch(`/api/public/partner-demo/${encodeURIComponent(token)}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "SECTION", value: section }),
    }).catch(() => undefined);
  }, [section, open, token]);
  useEffect(() => {
    if (open) document.title = `${info.portal.company} × CareTrail · ${copy.brandLine}`;
  }, [open, info, copy.brandLine]);

  const onSessionChange = useCallback(() => {
    void load();
    setRefreshKey((k) => k + 1);
  }, [load]);

  if (failure || (info && info.state !== "open")) {
    const message = failure === "network" ? copy.states.network : info?.state === "expired" ? copy.states.expired : info?.state === "revoked" ? copy.states.revoked : copy.states.invalid;
    return (
      <Shell copy={copy} lang={lang} setLang={setLang} info={null}>
        <div className="mx-auto mt-10 max-w-lg rounded-3xl border border-line bg-surface p-8 text-center shadow-card">
          <Lock size={28} className="mx-auto text-muted" aria-hidden />
          <p className="mt-4 text-lg font-semibold text-ink">{message}</p>
          {failure !== "network" ? <p className="mt-2 text-sm text-muted">{copy.states.askUs}</p> : null}
        </div>
      </Shell>
    );
  }
  if (!info || !kit) {
    return (
      <Shell copy={copy} lang={lang} setLang={setLang} info={null}>
        <p className="mt-10 text-center text-sm text-muted">{copy.states.loading}</p>
      </Shell>
    );
  }
  if (!info.viewer) {
    return (
      <Shell copy={copy} lang={lang} setLang={setLang} info={info}>
        <AckGate
          token={token}
          info={info}
          copy={copy}
          onDone={() => {
            window.scrollTo({ top: 0 });
            void load();
          }}
        />
      </Shell>
    );
  }

  const usage = info.usage;
  const expiry = new Intl.DateTimeFormat(copy.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date(info.portal.expiresAt));
  const remaining = usage ? `${Math.floor(usage.remainingSeconds / 60)} dk`.replace("dk", lang === "tr" ? "dk" : "min") : "";

  return (
    <Shell
      copy={copy}
      lang={lang}
      setLang={setLang}
      info={info}
      header={
        usage ? (
          <span className="hidden h-9 shrink-0 items-center gap-1.5 rounded-xl bg-canvas px-3 text-sm text-ink ring-1 ring-line md:inline-flex" title={copy.tryIt.perSession(Math.round(usage.sessionSeconds / 60))}>
            <Timer size={15} className="text-brand" aria-hidden />
            <span className="tabular-nums">{copy.tryIt.remaining(remaining)}</span>
          </span>
        ) : null
      }
    >
      <nav aria-label={kit.company} className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex min-w-max gap-1.5 rounded-2xl border border-line bg-surface p-1.5 shadow-card">
          {SECTIONS.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => go(id)}
                aria-current={section === id ? "page" : undefined}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors duration-150 ${section === id ? "bg-brand/10 text-brand" : "text-ink hover:bg-canvas"}`}
              >
                {copy.nav[id]}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {usage ? (
        <p className="mb-4 flex items-center gap-1.5 text-sm text-muted md:hidden">
          <Timer size={15} className="text-brand" aria-hidden /> {copy.tryIt.remaining(remaining)} · {copy.tryIt.perSession(Math.round(usage.sessionSeconds / 60))}
        </p>
      ) : null}

      {section === "welcome" ? (
        <WelcomeSection
          copy={copy}
          lang={lang}
          kit={kit}
          contactName={info.portal.contactName}
          hostContact={info.portal.hostContact}
          minuteBudget={info.portal.minuteBudget}
          sessionMinutes={Math.round(info.portal.sessionSeconds / 60)}
          expiry={expiry}
          onStart={() => go("try")}
        />
      ) : section === "try" ? (
        <TrySection token={token} kit={kit} copy={copy} lang={lang} info={info} onSessionChange={onSessionChange} />
      ) : section === "results" ? (
        <ResultsSection token={token} copy={copy} lang={lang} refreshKey={refreshKey} />
      ) : section === "learns" ? (
        <LearnsSection copy={copy} lang={lang} knowledge={info.knowledge ?? null} />
      ) : section === "integration" ? (
        <IntegrationSection copy={copy} />
      ) : (
        <PilotSection copy={copy} lang={lang} kit={kit} />
      )}
    </Shell>
  );
}
