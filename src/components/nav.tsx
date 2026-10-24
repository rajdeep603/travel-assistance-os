"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Calculator,
  Code2,
  FileText,
  FolderKanban,
  Handshake,
  Home,
  MessageSquareText,
  Headset,
  Inbox,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Scale,
  ShieldCheck,
  Stethoscope,
  Wallet,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand";
import { T } from "@/components/i18n";
import { BRAND, POWERED_BY } from "@/lib/brand";
import {
  SIDEBAR_DOCK_QUERY,
  SIDEBAR_EVENT,
  SIDEBAR_TOGGLE_EVENT,
  isSidebarHidden,
  setSidebarHidden,
} from "@/lib/sidebar";

/** The workspace in the buyer's order: operations, money, the network, then selling and the platform. */
export const NAV_SECTIONS = [
  {
    label: "Assistance",
    items: [
      { href: "/", label: "Dashboard", icon: Home },
      { href: "/cases", label: "AI Case Manager", icon: FolderKanban },
      { href: "/inbox", label: "Inbox & WhatsApp", icon: Inbox },
      { href: "/voice", label: "Voice Agents", icon: Mic },
      { href: "/calls", label: "Call Center", icon: Headset },
      { href: "/assistant", label: "Internal AI Assistant", icon: MessageSquareText },
    ],
  },
  {
    label: "Medical and money",
    items: [
      { href: "/documents", label: "Medical Document AI", icon: FileText },
      { href: "/claims", label: "Claims Automation", icon: ReceiptText },
      { href: "/providers", label: "Provider Search", icon: Stethoscope },
    ],
  },
  {
    label: "Network",
    items: [
      { href: "/receivables", label: "Receivables", icon: Wallet },
      { href: "/oversight", label: "Partner oversight", icon: Scale },
    ],
  },
  {
    label: "Sales and platform",
    items: [
      { href: "/business-case", label: "Business Case", icon: Calculator },
      { href: "/leads", label: "Leads", icon: Handshake },
      { href: "/trust", label: "Trust & Integration", icon: ShieldCheck },
      { href: "/developers", label: "Developers (API)", icon: Code2 },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SideNav({ highlightId = "nav-active" }: { highlightId?: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-4 px-3" aria-label="Main navigation">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-[11px] font-medium text-muted/80"><T>{section.label}</T></p>
          {section.items.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} highlightId={highlightId} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function NavLink({ href, label, icon: Icon, active, highlightId }: (typeof NAV_ITEMS)[number] & { active: boolean; highlightId: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  // On a short screen (an iPad in landscape) the current page's item may sit below the fold.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <Link
      ref={ref}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        active ? "text-brand" : "text-slate-600 hover:bg-canvas hover:text-ink"
      }`}
    >
      {/* The highlight slides from the previous page's item to this one. */}
      {active ? (
        <motion.span
          layoutId={highlightId}
          className="absolute inset-0 rounded-xl bg-brand/10"
          transition={{ type: "spring", stiffness: 520, damping: 40 }}
          aria-hidden
        />
      ) : null}
      <Icon size={18} strokeWidth={1.9} className={`relative ${active ? "text-brand" : "text-slate-500 group-hover:text-ink"}`} aria-hidden />
      <span className="relative"><T>{label}</T></span>
    </Link>
  );
}

/** Brand, navigation and credit: the sidebar's content, docked or in the drawer. */
function SidebarBody({ drawer = false }: { drawer?: boolean }) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <BrandMark size={32} idSuffix={drawer ? "-drawer" : ""} />
        <p className="flex min-w-0 items-center gap-1.5 text-xl font-bold tracking-tight text-ink">
          {BRAND.name}
          <span translate="no" className="rounded-md bg-brand/10 px-1.5 py-0.5 text-xs font-bold text-brand">AI</span>
        </p>
      </div>
      <div className="pt-3">
        <SideNav highlightId={drawer ? "nav-active-drawer" : "nav-active"} />
      </div>
      <div className="mx-3 mt-auto pt-6">
        <p className="rounded-xl bg-canvas px-3 py-2.5 text-xs leading-snug text-muted">
          <span className="block font-semibold text-ink"><T>{BRAND.tagline}</T></span>
          {POWERED_BY}
        </p>
      </div>
    </>
  );
}

/**
 * The sidebar docked beside the page on wide screens (an iPad in landscape,
 * laptops). The header toggle slides it away to give the page the full width.
 */
export function DockedSidebar() {
  return (
    <aside
      id="sidebar"
      className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-hidden border-r border-line bg-surface transition-[width,visibility] duration-[250ms] ease-smooth lg:block lg:sidebar-hidden:invisible lg:sidebar-hidden:w-0"
    >
      <div className="relative flex h-full w-64 flex-col overflow-y-auto pb-5">
        <SidebarBody />
      </div>
    </aside>
  );
}

/** The sidebar as a drawer over the page on narrower screens (an iPad in portrait, phones). */
function SidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <motion.div
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            aria-hidden
          />
          <motion.div
            className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface pb-5 shadow-2xl"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="absolute right-3 top-3 rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              <X size={20} aria-hidden />
            </button>
            <SidebarBody drawer />
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * The header's sidebar button. On wide screens it hides or shows the docked
 * sidebar (remembered per browser); on narrower ones it opens the drawer.
 * ⌘\ / Ctrl \ and the command palette do the same.
 */
export function SidebarToggle() {
  const pathname = usePathname();
  const [wide, setWide] = useState(false);
  const [docked, setDocked] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The root layout applies the saved state before paint; mirror it here.
  useEffect(() => {
    setMounted(true);
    setDocked(!isSidebarHidden());
    const mq = window.matchMedia(SIDEBAR_DOCK_QUERY);
    const sync = () => {
      setWide(mq.matches);
      // Turning an iPad to landscape docks the sidebar; drop the drawer.
      if (mq.matches) setDrawer(false);
    };
    sync();
    const follow = (e: Event) => setDocked(!(e as CustomEvent<boolean>).detail);
    mq.addEventListener("change", sync);
    window.addEventListener(SIDEBAR_EVENT, follow);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener(SIDEBAR_EVENT, follow);
    };
  }, []);

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  const toggle = useCallback(() => {
    if (window.matchMedia(SIDEBAR_DOCK_QUERY).matches) setSidebarHidden(!isSidebarHidden());
    else setDrawer((o) => !o);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, toggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SIDEBAR_TOGGLE_EVENT, toggle);
    };
  }, [toggle]);

  const closeDrawer = useCallback(() => {
    setDrawer(false);
    buttonRef.current?.focus();
  }, []);

  const shown = wide ? docked : drawer;
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={shown}
        aria-controls={wide ? "sidebar" : undefined}
        aria-keyshortcuts="Meta+Backslash Control+Backslash"
        aria-label={shown ? "Hide sidebar" : "Show sidebar"}
        title={shown ? "Hide sidebar (⌘\\)" : "Show sidebar (⌘\\)"}
        className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink"
      >
        {/* Chosen by CSS, like the sidebar itself, so the icon is right on first paint. */}
        <PanelLeftClose size={20} strokeWidth={1.9} className="hidden lg:block lg:sidebar-hidden:hidden rtl:-scale-x-100" aria-hidden />
        <PanelLeftOpen size={20} strokeWidth={1.9} className="lg:hidden lg:sidebar-hidden:block rtl:-scale-x-100" aria-hidden />
      </button>
      {mounted ? createPortal(<SidebarDrawer open={drawer} onClose={closeDrawer} />, document.body) : null}
    </>
  );
}
