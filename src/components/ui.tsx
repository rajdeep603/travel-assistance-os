import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { formatEnum } from "@/lib/format";

// Shared UI primitives: consistent buttons, badges, cards and states across
// every module, per the B2B SaaS UX requirement.

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`text-xs font-semibold uppercase tracking-wider text-slate-500 ${className}`}
    >
      {children}
    </h3>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  // cases
  NEW: "bg-blue-50 text-blue-700 border-blue-200",
  IN_PROGRESS: "bg-indigo-50 text-indigo-700 border-indigo-200",
  PENDING_INFO: "bg-amber-50 text-amber-700 border-amber-200",
  ESCALATED: "bg-red-50 text-red-700 border-red-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-200",
  // claims
  SUBMITTED: "bg-blue-50 text-blue-700 border-blue-200",
  PROCESSING: "bg-indigo-50 text-indigo-700 border-indigo-200",
  NEEDS_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  INFO_REQUESTED: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  // documents / appointments
  UPLOADED: "bg-blue-50 text-blue-700 border-blue-200",
  PROCESSED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-200",
  COMPLETED: "bg-slate-100 text-slate-600 border-slate-200",
  // priorities
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
  MEDIUM: "bg-blue-50 text-blue-700 border-blue-200",
  HIGH: "bg-amber-50 text-amber-700 border-amber-200",
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
};

export function StatusBadge({ value }: { value: string }) {
  const style = STATUS_STYLES[value] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${style}`}
    >
      {formatEnum(value)}
    </span>
  );
}

/** Dot colors matching StatusBadge, for timelines and chart labels. */
export const STATUS_DOTS: Record<string, string> = {
  NEW: "bg-blue-500",
  IN_PROGRESS: "bg-indigo-500",
  PENDING_INFO: "bg-amber-500",
  ESCALATED: "bg-red-500",
  RESOLVED: "bg-emerald-500",
  CLOSED: "bg-slate-400",
  SUBMITTED: "bg-blue-500",
  PROCESSING: "bg-indigo-500",
  NEEDS_REVIEW: "bg-amber-500",
  INFO_REQUESTED: "bg-amber-500",
  APPROVED: "bg-emerald-500",
  REJECTED: "bg-red-500",
  PAID: "bg-emerald-500",
};

type ButtonVariant = "primary" | "secondary" | "danger" | "success";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:shadow disabled:bg-blue-300 disabled:shadow-none border-transparent",
  secondary:
    "bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 border-slate-300 disabled:text-slate-400 disabled:hover:border-slate-300",
  danger:
    "bg-white text-red-600 hover:bg-red-50 border-red-300 disabled:text-red-300",
  success:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:shadow disabled:bg-emerald-300 disabled:shadow-none border-transparent",
};

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  busy,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 enabled:active:scale-[0.98] disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

/** One shimmering placeholder block. Size it with width/height classes. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded-md ${className}`}
      aria-hidden
    />
  );
}

/**
 * Skeleton for a loading list or table: label-width shimmer lines, so the
 * page keeps its shape instead of showing a spinner (loading-state best
 * practice for content).
 */
export function SkeletonRows({
  rows = 4,
  withAvatar = false,
}: {
  rows?: number;
  withAvatar?: boolean;
}) {
  return (
    <div role="status" aria-label="Loading content" className="space-y-3 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {withAvatar ? <Skeleton className="h-8 w-8 rounded-full" /> : null}
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className={`h-3 ${i % 2 ? "w-2/3" : "w-1/2"}`} />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500" role="status" aria-live="polite">
      <Loader2 size={16} className="animate-spin text-blue-600" aria-hidden />
      {label ?? "Loading…"}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function KeyValue({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="py-1.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">
        {value ?? <span className="text-slate-400">—</span>}
      </dd>
    </div>
  );
}

/**
 * Visual confidence meter: AI confidence as a labelled bar, banded by
 * review need (high = trust, medium = glance, low = human review).
 */
export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const band =
    pct >= 80
      ? { bar: "bg-emerald-500", label: "High confidence" }
      : pct >= 60
        ? { bar: "bg-amber-500", label: "Medium confidence — worth a glance" }
        : { bar: "bg-red-500", label: "Low confidence — needs human review" };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Extraction confidence
        </span>
        <span className="text-sm font-semibold text-slate-800">{pct}%</span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Extraction confidence"
      >
        <div
          className={`animate-bar-grow h-full rounded-full ${band.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">{band.label}</p>
    </div>
  );
}

export interface TimelineItem {
  title: ReactNode;
  meta?: ReactNode;
  time?: string;
  dotClass?: string;
}

/** Vertical event timeline with dots — case journeys and claim history. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative ml-1.5 space-y-4 border-l-2 border-slate-100 pl-5">
      {items.map((item, i) => (
        <li key={i} className="relative">
          <span
            className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white ${
              item.dotClass ?? "bg-blue-500"
            }`}
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-medium text-slate-800">{item.title}</p>
            {item.time ? (
              <span className="text-xs text-slate-400">{item.time}</span>
            ) : null}
          </div>
          {item.meta ? (
            <p className="mt-0.5 text-xs text-slate-500">{item.meta}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Extracts a friendly error message from an API error response body. */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}
