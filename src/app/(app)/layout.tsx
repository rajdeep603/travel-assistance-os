import { MobileNav, SideNav } from "@/components/nav";
import { OperatorMenu } from "@/components/operator-menu";
import { PresentToggle } from "@/components/present-toggle";
import { BrandMark } from "@/components/brand";
import { BRAND, POWERED_BY } from "@/lib/brand";
import { SessionWatch } from "@/components/session-watch";

/** The operator workspace: sidebar navigation, header and page content. */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <SessionWatch />
      <aside className="hidden w-64 shrink-0 flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 pb-6 md:flex">
        <div className="flex items-center gap-2.5 px-5 py-6 text-white">
          <BrandMark size={36} />
          <div>
            <p className="text-lg font-semibold leading-tight tracking-tight">{BRAND.name}</p>
            <p className="text-xs leading-snug text-slate-400">{BRAND.tagline}</p>
          </div>
        </div>
        <SideNav />
        <p className="mt-auto px-6 pt-6 text-xs text-slate-500">{POWERED_BY}</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur md:px-6 md:py-3">
          <div className="flex items-center gap-2">
            <MobileNav />
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:hidden">
              <BrandMark size={24} />
              {BRAND.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <OperatorMenu />
            <PresentToggle />
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 md:text-xs">
              Fictional data
            </span>
          </div>
        </header>
        <main id="main-content" className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
