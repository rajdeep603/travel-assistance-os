import { BRAND, POWERED_BY } from "@/lib/brand";

/**
 * The visitor's page: what a booth visitor opens on their own phone after
 * scanning the QR code. Its own chrome: no operator workspace, no sign-in;
 * the dashboard's morning sky and dotted map behind the opening lines.
 */
export default function VisitorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-canvas text-ink">
      <div aria-hidden className="hero-sky pointer-events-none absolute inset-x-0 top-0 h-[560px] [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
        <div className="hero-map absolute inset-0 opacity-60" />
      </div>
      <main id="main-content" className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-6 sm:max-w-lg">
        {children}
      </main>
      <footer className="relative px-6 pb-8 text-center text-xs text-muted">
        {POWERED_BY} · {BRAND.company}
      </footer>
    </div>
  );
}
