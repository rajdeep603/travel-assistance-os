import { BrandMark } from "@/components/brand";
import { BRAND, POWERED_BY } from "@/lib/brand";

/** Pages people reach without the operator workspace: sign-in, claimant uploads. */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2.5 px-6 py-5">
        <BrandMark size={34} />
        <div>
          <p className="text-lg font-semibold leading-tight tracking-tight text-slate-900">{BRAND.name}</p>
          <p className="text-xs text-slate-500">{BRAND.tagline}</p>
        </div>
      </header>
      <main id="main-content" className="flex flex-1 flex-col items-center px-4 pb-10 pt-4 md:pt-10">
        {/* Tablets and up: short pages (sign-in) sit in the middle of the screen, not at the top. */}
        <div className="w-full md:my-auto">{children}</div>
      </main>
      <footer className="px-6 pb-6 text-center text-xs text-slate-500">
        {POWERED_BY} · Fictional data · demonstration environment
      </footer>
    </div>
  );
}
