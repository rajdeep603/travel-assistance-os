import { BrandMark } from "@/components/brand";

/** Pages people reach without the operator workspace: sign-in, claimant uploads. */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-2.5 px-6 py-5">
        <BrandMark size={32} />
        <span className="text-sm font-semibold leading-tight text-slate-800">
          Travel Assistance
          <br />
          AI Platform
        </span>
      </header>
      <main id="main-content" className="flex flex-1 flex-col items-center px-4 pb-10 pt-4 md:pt-10">
        <div className="w-full">{children}</div>
      </main>
      <footer className="px-6 pb-6 text-center text-xs text-slate-500">Fictional data · demonstration environment</footer>
    </div>
  );
}
