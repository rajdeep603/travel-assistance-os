"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Calculator,
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
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand";
import { BRAND, POWERED_BY } from "@/lib/brand";
import {
  SIDEBAR_DOCK_QUERY,
  SIDEBAR_EVENT,
  SIDEBAR_TOGGLE_EVENT,
  isSidebarHidden,
  setSidebarHidden,
} from "@/lib/sidebar";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/business-case", label: "Business Case", icon: Calculator },
  { href: "/leads", label: "Leads", icon: Handshake },
  { href: "/documents", label: "Medical Document AI", icon: FileText },
  { href: "/cases", label: "AI Case Manager", icon: FolderKanban },
  { href: "/claims", label: "Claims Automation", icon: ReceiptText },
  { href: "/providers", label: "Provider Search", icon: Stethoscope },
  { href: "/assistant", label: "Internal AI Assistant", icon: MessageSquareText },
  { href: "/voice", label: "Voice Agents", icon: Mic },
  { href: "/calls", label: "Call Center", icon: Headset },
  { href: "/inbox", label: "Inbox (e-mail & fax)", icon: Inbox },
  { href: "/trust", label: "Trust & Integration", icon: ShieldCheck },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SideNav({ highlightId = "nav-active" }: { highlightId?: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label="Main navigation">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-2 ${
              active ? "text-white" : "text-stage-muted hover:bg-stage-raised hover:text-white"
            }`}
          >
            {/* The highlight slides from the previous page's item to this one. */}
            {active ? (
              <motion.span
                layoutId={highlightId}
                className="absolute inset-0 rounded-lg bg-brand shadow-sm shadow-brand/30"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
                aria-hidden
              />
            ) : null}
            <Icon size={17} strokeWidth={2} className="relative" aria-hidden />
            <span className="relative">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Brand, navigation and credit: the sidebar's content, docked or in the drawer. */
function SidebarBody({ drawer = false }: { drawer?: boolean }) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-5 py-6 text-white">
        <BrandMark size={36} idSuffix={drawer ? "-drawer" : ""} />
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight tracking-tight">{BRAND.name}</p>
          <p className="text-xs leading-snug text-stage-muted">{BRAND.tagline}</p>
        </div>
      </div>
      <SideNav highlightId={drawer ? "nav-active-drawer" : "nav-active"} />
      <p className="mt-auto px-6 pt-6 text-xs text-stage-muted/80">{POWERED_BY}</p>
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
      className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-hidden bg-stage transition-[width,visibility] duration-[250ms] ease-smooth lg:block lg:sidebar-hidden:invisible lg:sidebar-hidden:w-0"
    >
      <div className="flex h-full w-64 flex-col overflow-y-auto pb-6">
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
            className="absolute inset-0 bg-stage/50 backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            aria-hidden
          />
          <motion.div
            className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-stage pb-6 shadow-2xl"
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
              className="absolute right-3 top-3 rounded-lg p-2 text-stage-muted transition-colors hover:bg-stage-raised hover:text-white"
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
        <PanelLeftClose size={20} strokeWidth={1.9} className="hidden lg:block lg:sidebar-hidden:hidden" aria-hidden />
        <PanelLeftOpen size={20} strokeWidth={1.9} className="lg:hidden lg:sidebar-hidden:block" aria-hidden />
      </button>
      {mounted ? createPortal(<SidebarDrawer open={drawer} onClose={closeDrawer} />, document.body) : null}
    </>
  );
}
