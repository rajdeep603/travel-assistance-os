"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Calculator,
  FileText,
  FolderKanban,
  Handshake,
  Home,
  Menu,
  MessageSquareText,
  Headset,
  Inbox,
  Mic,
  ReceiptText,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";

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

export function SideNav() {
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
                layoutId="nav-active"
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

/** Hamburger navigation for small screens (the sidebar is hidden there). */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the menu on navigation and lock body scroll while it is open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open ? (
        <div className="fixed inset-0 top-[53px] z-40 flex flex-col bg-slate-900/50" onClick={() => setOpen(false)}>
          <nav
            aria-label="Main navigation"
            className="animate-slide-down flex flex-col gap-1 border-b border-slate-200 bg-white p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon size={17} strokeWidth={2} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
