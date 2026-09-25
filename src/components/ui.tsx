import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

// Shared UI primitives: consistent buttons, badges, cards and states across
// every module, per the B2B SaaS UX requirement.

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
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
      {value.replace(/_/g, " ")}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "success";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 border-transparent",
  secondary:
    "bg-white text-slate-700 hover:bg-slate-50 border-slate-300 disabled:text-slate-400",
  danger:
    "bg-white text-red-600 hover:bg-red-50 border-red-300 disabled:text-red-300",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300 border-transparent",
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 size={16} className="animate-spin text-blue-600" />
      {label ?? "Loading…"}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
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
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
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
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">
        {value ?? <span className="text-slate-400">—</span>}
      </dd>
    </div>
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
