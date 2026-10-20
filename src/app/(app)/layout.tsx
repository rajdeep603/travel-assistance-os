import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { AssistantProvider } from "@/components/assistant/assistant-provider";
import { CommandPalette, SearchButton } from "@/components/command-palette";
import { DockedSidebar, SidebarToggle } from "@/components/nav";
import { OperatorMenu } from "@/components/operator-menu";
import { PresentToggle } from "@/components/present-toggle";
import { BrandMark } from "@/components/brand";
import { BRAND } from "@/lib/brand";
import { SessionWatch } from "@/components/session-watch";

/** The operator workspace: sidebar navigation, header and page content. */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AssistantProvider>
      <div className="flex min-h-dvh">
        <SessionWatch />
        <CommandPalette />
        <AssistantLauncher />
        <DockedSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur md:px-6 md:py-3">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarToggle />
              {/* The brand stays on screen while the sidebar is out of view. */}
              <p className="flex shrink-0 items-center gap-2 pr-1 text-sm font-semibold text-ink lg:hidden lg:sidebar-hidden:flex">
                <BrandMark size={24} />
                <span className="hidden min-[380px]:inline">{BRAND.name}</span>
              </p>
              <SearchButton />
            </div>
            <div className="flex items-center gap-2">
              <OperatorMenu />
              <PresentToggle />
              <span className="whitespace-nowrap rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800 md:px-3 md:text-xs">
                Fictional data
              </span>
            </div>
          </header>
          {/* Room at the bottom so the floating assistant button never covers the last row;
              pages without the button (data-fab-free) keep the usual padding. */}
          <main
            id="main-content"
            className="min-w-0 flex-1 px-4 pb-24 pt-5 md:px-6 md:pt-6 xl:px-10 has-[[data-fab-free]]:pb-5 md:has-[[data-fab-free]]:pb-6"
          >
            {children}
          </main>
        </div>
      </div>
    </AssistantProvider>
  );
}
