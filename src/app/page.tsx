import Link from "next/link";
import {
  ArrowRight,
  FileText,
  FolderKanban,
  MessageSquareText,
  Mic,
  ReceiptText,
  Stethoscope,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const MODULES = [
  {
    href: "/documents",
    icon: FileText,
    title: "Medical Document AI",
    description: "Extract structured information from medical documents.",
    tag: "Priority",
  },
  {
    href: "/cases",
    icon: FolderKanban,
    title: "AI Case Manager",
    description: "Turn incoming assistance requests into actionable cases.",
    tag: "Priority",
  },
  {
    href: "/claims",
    icon: ReceiptText,
    title: "Claims Automation",
    description: "Assist with claim document processing and review.",
    tag: null,
  },
  {
    href: "/providers",
    icon: Stethoscope,
    title: "Provider Search",
    description: "Find suitable healthcare providers.",
    tag: null,
  },
  {
    href: "/assistant",
    icon: MessageSquareText,
    title: "Internal AI Assistant",
    description: "Ask questions about cases, providers and operational knowledge.",
    tag: null,
  },
  {
    href: "/voice",
    icon: Mic,
    title: "Voice Medical Assistance Agent",
    description: "Help travellers find and book medical appointments through voice.",
    tag: "Voice",
  },
];

const STORY = [
  "Customer",
  "Voice / Email",
  "AI Understanding",
  "Case Creation",
  "Medical Documents",
  "Provider Search",
  "Appointment",
  "Claims",
  "Human Operations",
];

async function getCounts() {
  try {
    const [cases, claims, providers, appointments] = await Promise.all([
      prisma.case.count(),
      prisma.claim.count(),
      prisma.provider.count(),
      prisma.appointment.count(),
    ]);
    return { cases, claims, providers, appointments };
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const counts = await getCounts();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">
          Travel Assistance AI Platform
        </h1>
        <p className="mt-2 text-base text-slate-500">
          AI-powered automation for travel assistance and healthcare operations
        </p>
      </div>

      {counts ? (
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ["Active cases", counts.cases],
            ["Claims", counts.claims],
            ["Network providers", counts.providers],
            ["Appointments", counts.appointments],
          ].map(([label, value]) => (
            <Card key={label} className="py-4">
              <p className="text-2xl font-semibold text-slate-900">{value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                {label}
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          The database is currently unreachable — live counters are hidden. The
          module demos will retry automatically.
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {MODULES.map(({ href, icon: Icon, title, description, tag }) => (
          <Card key={href} className="flex flex-col">
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                <Icon size={22} />
              </div>
              {tag ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                  {tag}
                </span>
              ) : null}
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-500">
              {description}
            </p>
            <Link
              href={href}
              className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Launch Demo
              <ArrowRight size={15} />
            </Link>
          </Card>
        ))}
      </div>

      <Card className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          The end-to-end story
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-y-2 text-sm">
          {STORY.map((step, i) => (
            <span key={step} className="flex items-center">
              <span
                className={`rounded-md px-2.5 py-1 font-medium ${
                  i === 0 || i === STORY.length - 1
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {step}
              </span>
              {i < STORY.length - 1 ? (
                <ArrowRight size={14} className="mx-1.5 text-slate-400" />
              ) : null}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          One manual workflow at a time: AI handles intake, documents, provider
          matching and booking — people stay in charge of care decisions.
        </p>
      </Card>
    </div>
  );
}
