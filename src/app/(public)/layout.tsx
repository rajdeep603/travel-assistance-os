import { BrandLogo } from "@/components/brand";
import { BRAND, POWERED_BY } from "@/lib/brand";

/** Pages people reach without the operator workspace: sign-in, claimant uploads. */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2.5 px-6 py-5">
        <div>
          <BrandLogo height={38} />
          <p className="mt-1 text-xs text-muted">
            {BRAND.tagline} · {POWERED_BY}
          </p>
        </div>
      </header>
      <main id="main-content" className="flex flex-1 flex-col items-center px-4 pb-10 pt-4 md:pt-10">
        {/* Tablets and up: short pages (sign-in) sit in the middle of the screen, not at the top. */}
        <div className="w-full md:my-auto">{children}</div>
      </main>
      <footer className="px-6 pb-6 text-center text-xs text-muted">
        {POWERED_BY} · Fictional data · demonstration environment
      </footer>
    </div>
  );
}
