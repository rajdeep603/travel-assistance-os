import { BRAND, POWERED_BY } from "@/lib/brand";

/**
 * The visitor's page: what a booth visitor opens on their own phone after
 * scanning the QR code. Its own chrome: no operator workspace, no sign-in,
 * and the dark stage end to end, like the voice agent.
 */
export default function VisitorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-stage text-stage-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_55%_at_50%_0%,rgb(var(--c-brand)/0.45),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgb(var(--c-stage-line))_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]"
      />
      <main id="main-content" className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-6 sm:max-w-lg">
        {children}
      </main>
      <footer className="relative px-6 pb-8 text-center text-xs text-stage-muted">
        {POWERED_BY} · {BRAND.company}
      </footer>
    </div>
  );
}
