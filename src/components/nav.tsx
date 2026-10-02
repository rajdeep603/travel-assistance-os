"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FileText,
  FolderKanban,
  Home,
  Menu,
  MessageSquareText,
  Mic,
  ReceiptText,
  Stethoscope,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/documents", label: "Medical Document AI", icon: FileText },
  { href: "/cases", label: "AI Case Manager", icon: FolderKanban },
  { href: "/claims", label: "Claims Automation", icon: ReceiptText },
  { href: "/providers", label: "Provider Search", icon: Stethoscope },
  { href: "/assistant", label: "Internal AI Assistant", icon: MessageSquareText },
  { href: "/voice", label: "Voice Agent", icon: Mic },
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
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
              active
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon size={17} strokeWidth={2} aria-hidden />
            {label}
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
        className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
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
                      ? "bg-blue-600 text-white"
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
